// 여행 검색 링크 생성 (순수 함수). 제휴 ID가 설정된 경우에만 제휴 파라미터를 붙인다.
import { AFFILIATE, affiliateEnabled } from './config.js';

function withAffiliate(params) {
  if (affiliateEnabled()) for (const [k, v] of Object.entries(AFFILIATE.params)) params.set(k, String(v));
  return params;
}

export function flightUrl(dest, depart, ret) {
  const p = new URLSearchParams({
    dcity: dest.from,
    acity: dest.to,
    ddate: depart,
    rdate: ret,
    triptype: 'rt',
    class: 'y',
    quantity: '1',
    locale: 'ko-KR',
    curr: 'KRW',
  });
  return `https://kr.trip.com/flights/showfarefirst?${withAffiliate(p)}`;
}

export function hotelUrl(dest, checkin, checkout) {
  if (!dest.hotelCityId) return null;
  const p = new URLSearchParams({
    cityId: String(dest.hotelCityId),
    checkin,
    checkout,
    adult: '2',
    locale: 'ko-KR',
    curr: 'KRW',
  });
  return `https://kr.trip.com/hotels/list?${withAffiliate(p)}`;
}
