// GA4（gtag.js）へのカスタムイベント送信ヘルパー。
// gtag は app/layout.tsx で afterInteractive ロードされる。スクリプト未ロード時や
// SSR 時は no-op になるよう、毎回 window.gtag の存在を確認してから呼ぶ。
//
// honesty 方針と同様、計測も「実際に起きたこと」だけを送る。推測値や水増しはしない。

type GtagFn = (command: "event", eventName: string, params?: Record<string, unknown>) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
  }
}

/** GA4 へカスタムイベントを1件送る。gtag 未ロード時・SSR 時は何もしない。 */
export function track(eventName: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", eventName, params);
}

/** 自治体の選択（地図クリック／検索）。method で導線を区別する。 */
export function trackSelectMunicipality(code: string, method: "map" | "search"): void {
  track("select_municipality", { municipality_code: code, method });
}

/** 塗り分け指標の切り替え。 */
export function trackChangeMetric(metricKey: string): void {
  track("change_metric", { metric_key: metricKey });
}
