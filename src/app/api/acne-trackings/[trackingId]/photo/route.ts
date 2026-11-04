import {
  handleAcneTrackingApiError,
  readAcneTrackingPhoto,
  requireAcneTrackingSameOrigin,
  replaceAcneTrackingPhoto,
  removeAcneTrackingPhoto,
  requireAcneTrackingUserId,
  updateAcneTrackingPhotoMarker,
} from "@/lib/acne-tracking-api";

type RouteContext = { params: Promise<{ trackingId: string }> };

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const userId = await requireAcneTrackingUserId();
    const { trackingId } = await context.params;
    return await readAcneTrackingPhoto(trackingId, userId);
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
    return await replaceAcneTrackingPhoto(trackingId, request, userId);
  } catch (error) {
    return handleAcneTrackingApiError(error);
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    requireAcneTrackingSameOrigin(request);
    const userId = await requireAcneTrackingUserId();
    const { trackingId } = await context.params;
    return await updateAcneTrackingPhotoMarker(trackingId, request, userId);
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
    return await removeAcneTrackingPhoto(trackingId, userId);
  } catch (error) {
    return handleAcneTrackingApiError(error);
  }
}
