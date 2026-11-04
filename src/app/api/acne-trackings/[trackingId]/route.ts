import {
  deleteAcneTracking,
  getAcneTracking,
  handleAcneTrackingApiError,
  requireAcneTrackingSameOrigin,
  requireAcneTrackingUserId,
  updateAcneTrackingMetadata,
} from "@/lib/acne-tracking-api";

type RouteContext = { params: Promise<{ trackingId: string }> };

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const userId = await requireAcneTrackingUserId();
    const { trackingId } = await context.params;
    return await getAcneTracking(trackingId, userId);
  } catch (error) {
    return handleAcneTrackingApiError(error);
  }
}

export async function PUT(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    requireAcneTrackingSameOrigin(request);
    const userId = await requireAcneTrackingUserId();
    const { trackingId } = await context.params;
    return await updateAcneTrackingMetadata(trackingId, request, userId);
  } catch (error) {
    return handleAcneTrackingApiError(error);
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    requireAcneTrackingSameOrigin(request);
    const userId = await requireAcneTrackingUserId();
    const { trackingId } = await context.params;
    return await deleteAcneTracking(trackingId, userId);
  } catch (error) {
    return handleAcneTrackingApiError(error);
  }
}
