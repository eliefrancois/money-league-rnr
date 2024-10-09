

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pgsodium" WITH SCHEMA "pgsodium";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."league_platform" AS ENUM (
    'espn',
    'sleeper',
    'yahoo'
);


ALTER TYPE "public"."league_platform" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_member_to_league"("p_owner_id" "uuid", "p_league_id" bigint, "p_has_paid" boolean, "p_is_commissioner" boolean) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    buy_in_amount decimal;
BEGIN
    -- Check if the user is already a member of the league
    IF EXISTS (SELECT 1 FROM owner_leagues WHERE owner_id = p_owner_id AND league_id = p_league_id) THEN
        RAISE EXCEPTION 'User is already a member of this league';
    END IF;

    -- Insert the new member into the owner_league table
    INSERT INTO owner_leagues (owner_id, league_id, has_paid, is_commissioner, created_at)
    VALUES (p_owner_id, p_league_id, p_has_paid, p_is_commissioner, NOW());

    -- Get the buy-in amount from the leagues table
    SELECT buy_in_amount INTO buy_in_amount FROM leagues WHERE id = p_league_id;

    -- Update the league_pots table
    UPDATE league_pots
    SET current_size = current_size + 1,
        total_amount = total_amount + buy_in_amount,
        updated_at = NOW()
    WHERE league_id = p_league_id;
END;
$$;


ALTER FUNCTION "public"."add_member_to_league"("p_owner_id" "uuid", "p_league_id" bigint, "p_has_paid" boolean, "p_is_commissioner" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."leagues" (
    "id" bigint NOT NULL,
    "external_league_id" bigint,
    "commissioner_id" "uuid",
    "league_name" "text" NOT NULL,
    "league_size" integer NOT NULL,
    "in_season" boolean DEFAULT false,
    "platform" "public"."league_platform" NOT NULL,
    "buy_in_amount" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "league_stats" "jsonb"
);


ALTER TABLE "public"."leagues" OWNER TO "postgres";


ALTER TABLE "public"."leagues" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."leagues_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."owner_leagues" (
    "id" bigint NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "league_id" bigint NOT NULL,
    "has_paid" boolean DEFAULT false,
    "is_commissioner" boolean DEFAULT false,
    "league_winner" boolean DEFAULT false,
    "league_rank" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."owner_leagues" OWNER TO "postgres";


ALTER TABLE "public"."owner_leagues" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."owner_leagues_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone,
    "username" "text",
    "full_name" "text",
    "avatar_url" "text",
    "website" "text",
    "is_espn_synced" boolean DEFAULT false,
    "is_sleeper_synced" boolean DEFAULT false,
    "is_yahoo_synced" boolean DEFAULT false,
    "espn_s2" "text",
    "espn_swid" "text",
    CONSTRAINT "username_length" CHECK (("char_length"("username") >= 3))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" bigint NOT NULL,
    "league_id" bigint NOT NULL,
    "espn_team_id" integer NOT NULL,
    "team_name" "text" NOT NULL,
    "owner_id" "uuid",
    "points" integer DEFAULT 0,
    "wins" integer DEFAULT 0,
    "losses" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "team_stats" "jsonb"
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


ALTER TABLE "public"."teams" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."teams_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."leagues"
    ADD CONSTRAINT "leagues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."owner_leagues"
    ADD CONSTRAINT "owner_leagues_owner_id_league_id_key" UNIQUE ("owner_id", "league_id");



ALTER TABLE ONLY "public"."owner_leagues"
    ADD CONSTRAINT "owner_leagues_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "unique_league_team" UNIQUE ("league_id", "espn_team_id");



ALTER TABLE ONLY "public"."leagues"
    ADD CONSTRAINT "leagues_commissioner_id_fkey" FOREIGN KEY ("commissioner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."owner_leagues"
    ADD CONSTRAINT "owner_leagues_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."owner_leagues"
    ADD CONSTRAINT "owner_leagues_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE;



CREATE POLICY "Commissioners can view their leagues" ON "public"."leagues" FOR SELECT USING (("commissioner_id" = "auth"."uid"()));



CREATE POLICY "League members can view all teams in their league" ON "public"."teams" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."owner_leagues"
  WHERE (("owner_leagues"."league_id" = "teams"."league_id") AND ("owner_leagues"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Members can view their leagues" ON "public"."leagues" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."owner_leagues"
  WHERE (("owner_leagues"."league_id" = "leagues"."id") AND ("owner_leagues"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Public profiles are viewable by everyone." ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Users can insert their own profile." ON "public"."profiles" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Users can join a league" ON "public"."owner_leagues" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can update own profile." ON "public"."profiles" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Users can update their membership" ON "public"."owner_leagues" FOR UPDATE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can view their league memberships" ON "public"."owner_leagues" FOR SELECT USING (("owner_id" = "auth"."uid"()));



ALTER TABLE "public"."leagues" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."owner_leagues" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
































































































































































































GRANT ALL ON FUNCTION "public"."add_member_to_league"("p_owner_id" "uuid", "p_league_id" bigint, "p_has_paid" boolean, "p_is_commissioner" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."add_member_to_league"("p_owner_id" "uuid", "p_league_id" bigint, "p_has_paid" boolean, "p_is_commissioner" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_member_to_league"("p_owner_id" "uuid", "p_league_id" bigint, "p_has_paid" boolean, "p_is_commissioner" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";





















GRANT ALL ON TABLE "public"."leagues" TO "anon";
GRANT ALL ON TABLE "public"."leagues" TO "authenticated";
GRANT ALL ON TABLE "public"."leagues" TO "service_role";



GRANT ALL ON SEQUENCE "public"."leagues_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."leagues_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."leagues_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."owner_leagues" TO "anon";
GRANT ALL ON TABLE "public"."owner_leagues" TO "authenticated";
GRANT ALL ON TABLE "public"."owner_leagues" TO "service_role";



GRANT ALL ON SEQUENCE "public"."owner_leagues_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."owner_leagues_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."owner_leagues_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON SEQUENCE "public"."teams_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."teams_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."teams_id_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
