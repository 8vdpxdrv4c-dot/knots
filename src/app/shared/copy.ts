import { SITE_NAME } from "./site";

/** The only knot page localized to Simplified Chinese. Other knots stay in English. */
export const ZH_KNOT_ID = "poachers-knot";

/**
 * Short Chinese names for the knot list on the Chinese page.
 * 单结、八字结、称人结、双套结、齐柏林结、平结、双圈索结 are the usual names;
 * the English line under each one is the site's original name, unchanged.
 */
export const ZH_LIST_NAMES: Record<string, string> = {
  overhand: "单结",
  "figure-eight": "八字结",
  bowline: "称人结",
  "clove-hitch": "双套结",
  zeppelin: "齐柏林结",
  "square-knot": "平结",
  "poachers-knot": "双圈索结",
};

/** Original English names, kept under the Chinese label in the side list. */
export const LIST_ENGLISH_NAMES: Record<string, string> = {
  overhand: "Overhand knot",
  "figure-eight": "Figure-eight knot",
  bowline: "Bowline",
  "clove-hitch": "Clove hitch – rope end",
  zeppelin: "Zeppelin bend",
  "square-knot": "Square knot",
  "poachers-knot": "Poacher's knot",
};

export const listEnglishName = (knot: { id: string; name: string }) =>
  LIST_ENGLISH_NAMES[knot.id] ?? knot.name;

export const isZhKnot = (id: string) => id === ZH_KNOT_ID;

export type UiLocale = "en" | "zh-CN";

/** Document title suffix and share-sheet site name. Every knot page in this build is Chinese. */
export const siteNameFor = (_id: string) => "轻松打绳结";

/** Open Graph image description. */
export const imageAltFor = (knot: { id: string; name: string }) => `打好的${knot.name}`;

export type Copy = {
  eyebrow: string;
  siteName: string;
  allKnots: string;
  pickAKnot: string;
  close: string;
  viewSource: string;
  showControls: string;
  hideControls: string;
  playback: string;
  play: string;
  pause: string;
  step: (n: number, title: string) => string;
  timeline: string;
  timelineValue: (time: string, duration: string) => string;
  speed: string;
  loop: string;
  share: string;
  linkCopied: string;
  shareTitle: (name: string) => string;
  shareText: (name: string) => string;
  resetView: string;
  scene: string;
  creditBefore: string;
  creditAfter: string;
  stargazerLead: string;
  stargazerRest: string;
  promptLabel: string;
  enjoying: string;
  starPitch: string;
  starOnGitHub: string;
  seeTheRope: string;
  notNow: string;
  ropeMaterial: string;
  resetDefaults: string;
  /** Slider labels keyed by physics field. Missing keys keep the English label. */
  physics: Record<string, string>;
};

const en: Copy = {
  eyebrow: "Knots made easy",
  siteName: SITE_NAME,
  allKnots: "All knots",
  pickAKnot: "Pick a knot",
  close: "Close",
  viewSource: "View source on GitHub",
  showControls: "Show controls (H)",
  hideControls: "Hide controls (H)",
  playback: "Playback",
  play: "Play",
  pause: "Pause",
  step: (n, title) => `Step ${n}: ${title}`,
  timeline: "Timeline",
  timelineValue: (time, duration) => `${time} of ${duration} seconds`,
  speed: "Speed",
  loop: "Loop",
  share: "Share this knot",
  linkCopied: "Link copied",
  shareTitle: (name) => `${name} · ${SITE_NAME}`,
  shareText: (name) => `${name}, step by step`,
  resetView: "Reset view",
  scene: "3D view of the rope. Drag to turn it, scroll or pinch to zoom.",
  creditBefore: "made by ",
  creditAfter: "",
  stargazerLead: "Stargazer",
  stargazerRest: " rope",
  promptLabel: "Join the stargazer rope",
  enjoying: "Enjoying it?",
  starPitch: " Star the repo and your face joins the rope.",
  starOnGitHub: "Star on GitHub",
  seeTheRope: "See the rope",
  notNow: "Not now",
  ropeMaterial: "Rope material",
  resetDefaults: "Reset to defaults",
  physics: {},
};

const zh: Copy = {
  eyebrow: "轻松打绳结",
  siteName: "轻松打绳结",
  allKnots: "全部绳结 / All knots",
  pickAKnot: "选择绳结",
  close: "关闭",
  viewSource: "在 GitHub 上查看源码",
  showControls: "显示控件（H）",
  hideControls: "隐藏控件（H）",
  playback: "播放控制",
  play: "播放",
  pause: "暂停",
  step: (n, title) => `第 ${n} 步：${title}`,
  timeline: "时间轴",
  timelineValue: (time, duration) => `${time} 秒，共 ${duration} 秒`,
  speed: "速度",
  loop: "循环",
  share: "分享这个绳结",
  linkCopied: "链接已复制",
  shareTitle: (name) => `${name} · 轻松打绳结`,
  shareText: (name) => `${name}，分步演示`,
  resetView: "重置视角",
  scene: "绳索的三维视图。拖动可旋转，滚动或双指捏合可缩放。",
  creditBefore: "由 ",
  creditAfter: " 制作",
  stargazerLead: "观星绳",
  stargazerRest: "",
  promptLabel: "加入观星绳",
  enjoying: "喜欢吗？",
  starPitch: "给仓库点一颗星，你的头像就会出现在这条绳子上。",
  starOnGitHub: "在 GitHub 点星",
  seeTheRope: "查看绳子",
  notNow: "以后再说",
  ropeMaterial: "绳索材质",
  resetDefaults: "恢复默认",
  physics: {
    bend: "抗弯刚度（N·m²）",
    twist: "抗扭刚度（N·m²）",
    mass: "绳索质量（kg）",
    friction: "摩擦",
    airDamping: "空气阻尼（1/s）",
    internalDamping: "内部阻尼",
  },
};

export const pageCopy = (locale: UiLocale): Copy => (locale === "zh-CN" ? zh : en);
