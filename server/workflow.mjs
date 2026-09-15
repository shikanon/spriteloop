import { validateProcessing } from "./catalog.mjs";
export function requestExtraction(job, body) {
  if (!job.videoReady) throw new Error("需要先生成或导入视频。");
  if (!job.continuityReview?.accepted && body.confirmContinuity !== true)
    throw Object.assign(
      new Error("请先循环预览并确认首尾动作连贯，再提取序列帧。"),
      { status: 409 },
    );
  const processing = validateProcessing(body.processing);
  return {
    processing,
    loop: true,
    continuityReview: job.continuityReview?.accepted
      ? job.continuityReview
      : { accepted: true, reviewedAt: new Date().toISOString() },
  };
}
