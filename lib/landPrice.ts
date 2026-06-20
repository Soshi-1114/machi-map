// 住宅地地価は常に正値。value<=0 は地価公示・地価調査の標準地がない自治体
// （北方領土・帰還困難区域・小離島など）＝「対象外（データなし）」のセンチネル。
export function hasLandPrice(value: number): boolean {
  return value > 0;
}
