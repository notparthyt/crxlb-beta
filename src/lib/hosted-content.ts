/**
 * What a copy of the game can list. The upstream repository carries RISE Motordrome and the 2026 prototype car
 * (`public/cars/f12026/`). This conversion copy also contains a local RB22 car and Interlagos, Yas Marina, Shanghai,
 * Monaco 2022, Sepang and Spa conversions. Hosted builds omit these until their assets are uploaded to the
 * librecorsa-assets R2 bucket and served by `cloudflare/worker.js`. Set `NEXT_PUBLIC_HOSTED_CONTENT=1` to list hosted
 * content; set it in `.env.local` too if you have the hosted files in `public/` (they are gitignored).
 */
export const HOSTED_CONTENT = process.env.NEXT_PUBLIC_HOSTED_CONTENT === "1";

/** Cars whose models and sounds are shipped in this repository */
export const REPO_CAR_IDS: ReadonlySet<string> = new Set(["lc26", "hyper-rb22"]);

/** The circuits in the repository */
export const REPO_TRACK_IDS: ReadonlySet<string> = new Set([
  "rwanda_official_short",
  "rwanda_official",
  "interlagos_f1_2023",
  "yas_marina_2021",
  "shanghai_blckbox_2021",
  "monaco_asw_2022",
  "sepang_chq_2026",
  "spa_fenryr_2025",
]);

const PRIVATE_LOCAL_CAR_IDS: ReadonlySet<string> = new Set(["hyper-rb22"]);
// Keep locally generated circuits out of hosted builds until their assets are uploaded to R2.
const HOSTED_EXCLUDED_TRACK_IDS: ReadonlySet<string> = new Set([
  "interlagos_f1_2023",
  "yas_marina_2021",
  "shanghai_blckbox_2021",
  "monaco_asw_2022",
  "sepang_chq_2026",
  "spa_fenryr_2025",
]);

/** Whether this copy lists a car */
export const carListed = (id: string): boolean =>
  HOSTED_CONTENT ? !PRIVATE_LOCAL_CAR_IDS.has(id) : REPO_CAR_IDS.has(id);

/** Whether this copy lists a circuit */
export const trackListed = (id: string): boolean =>
  HOSTED_CONTENT ? !HOSTED_EXCLUDED_TRACK_IDS.has(id) : REPO_TRACK_IDS.has(id);
