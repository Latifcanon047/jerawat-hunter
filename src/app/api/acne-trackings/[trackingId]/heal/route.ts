import {
  handleAcneTrackingApiError,
  markAcneTrackingHealed,
  requireAcneTrackingSameOrigin,
  requireAcneTrackingUserId,
} from "@/lib/acne-tracking-api";

type RouteContext = { params: Promise<{ trackingId: string }> };

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    requireAcneTrackingSameOrigin(request);
    const userId = await requireAcneTrackingUserId();
    const { trackingId } = await context.params;
    return await markAcneTrackingHealed(trackingId, userId);
  } catch (error) {
    return handleAcneTrackingApiError(error);
  }
}
