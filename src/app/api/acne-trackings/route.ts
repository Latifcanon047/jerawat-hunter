import {
  createAcneTracking,
  handleAcneTrackingApiError,
  listAcneTrackings,
  requireAcneTrackingSameOrigin,
  requireAcneTrackingUserId,
} from "@/lib/acne-tracking-api";

export async function GET(request: Request): Promise<Response> {
  try {
    const userId = await requireAcneTrackingUserId();
    return await listAcneTrackings(
      userId,
      new URL(request.url).searchParams
    );
  } catch (error) {
    return handleAcneTrackingApiError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireAcneTrackingSameOrigin(request);
    const userId = await requireAcneTrackingUserId();
    return await createAcneTracking(request, userId);
  } catch (error) {
    return handleAcneTrackingApiError(error);
  }
}
