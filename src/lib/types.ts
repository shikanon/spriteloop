export type Asset = {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  createdAt?: string;
};
export type Model = {
  id: string;
  name: string;
  resolutions: string[];
  maxDuration: number;
};
export type Processing = {
  mode: "uniform" | "keyframes";
  fps: number;
  removeWhite: boolean;
  backgroundColor: string;
  tolerance: number;
  softness: number;
  preserveWhite: boolean;
  size: number;
};
export type Frame = {
  name: string;
  url: string;
  timestamp: number;
  duration_ms: number;
  frame: { x: number; y: number; w: number; h: number };
};
export type Result = {
  revision: string;
  frames: Frame[];
  width: number;
  height: number;
  frame_count: number;
  fps: number;
  loop: boolean;
  videoUrl: string;
  sheetUrl: string;
  previewUrl: string;
  actual: { width: number; height: number; duration: number };
  processing: Processing;
};
export type Job = {
  id: string;
  source: "ark" | "import";
  name?: string;
  model?: string;
  prompt?: string;
  promptTemplate?: string;
  generationProcessing?: Processing;
  duration?: number;
  resolution?: string;
  firstAssetId?: string;
  lastAssetId?: string;
  loop: boolean;
  status: string;
  stage: string;
  progress: number;
  message?: string;
  error?: string;
  providerId?: string;
  videoReady?: boolean;
  preview?: {
    videoUrl: string;
    actual: { width: number; height: number; duration: number };
  };
  continuityReview?: { accepted: boolean; reviewedAt: string };
  createdAt: string;
  processing: Processing;
  result?: Result;
};
export const defaultProcessing: Processing = {
  mode: "uniform",
  fps: 12,
  removeWhite: true,
  backgroundColor: "#ffffff",
  tolerance: 30,
  softness: 2,
  preserveWhite: true,
  size: 512,
};
export const presets = [
  {
    name: "待机 / 呼吸",
    prompt:
      "角色原地待机，轻轻呼吸，披风和衣角自然微动，保持双脚位置不变，完成一个流畅的待机循环。",
  },
  {
    name: "奔跑",
    prompt:
      "角色朝右原地奔跑，双腿交替迈步，手臂自然摆动，披风随风飘动，角色位置固定，完成一个奔跑循环。",
  },
  {
    name: "攻击",
    prompt:
      "角色在原地挥动武器完成一次清晰有力的攻击，保持身体结构和装备一致，结束时恢复准备姿态。",
  },
];
