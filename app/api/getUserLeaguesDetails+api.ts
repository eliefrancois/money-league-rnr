const FLASK_API_BASE_URL = process.env.EXPO_PUBLIC_FLASK_API_BASE_URL;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    console.log("searchParams", searchParams);
    const leagueId = searchParams.get('leagueId');
    console.log("leagueId Type", typeof leagueId);
    const year = searchParams.get('year');
    console.log("year Type", typeof year);
    console.log("leagueId is", leagueId);
    console.log("year is", year);
    try {
        const SWID = request.headers.get('X-SWID');
        const espn_s2 = request.headers.get('X-ESPN-S2');

        if (!SWID || !espn_s2) {
            return Response.json({ error: 'SWID and espn_s2 are required' }, { status: 400 });
        }

        if (!leagueId) {
            return Response.json({ error: 'League ID and year are required' }, { status: 400 });
        }

        const response = await fetch(`${FLASK_API_BASE_URL}/api/user-leagues/details/${(leagueId)}/${year}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-SWID': SWID,
                'X-ESPN-S2': espn_s2
            }
        });
        const data = await response.json();
        return Response.json(data);
    }
    catch (error) {
        console.error('Error fetching data:', error);
        return Response.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }

}       

