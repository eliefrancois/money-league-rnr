const FLASK_API_BASE_URL = process.env.EXPO_PUBLIC_FLASK_API_BASE_URL;

export async function GET(request: Request) {
    try {
        const response = await fetch(`${FLASK_API_BASE_URL}/api/test`);
        const data = await response.json();
        return Response.json(data);
    } catch (error) {
        console.error('Error fetching data:', error);
        return Response.json({ error: 'An error occurred while fetching data' }, { status: 500 });
    }
}