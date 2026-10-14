// 운영 설정. 비밀값은 없다 (제휴 ID·분석 코드는 공개되어도 되는 식별자).
// 값이 비어 있으면 해당 기능은 '미연결' 상태로 동작한다: 제휴 파라미터 없이 일반 검색 링크,
// 분석 이벤트는 전송하지 않음.

export const SITE = {
  name: '연차각',
  url: 'https://rolex0331-cloud.github.io/yeonchagak/',
  contact: 'https://github.com/rolex0331-cloud/yeonchagak/issues',
};

// 트립닷컴 제휴(Trip.com Affiliate) 승인 후, 제휴 대시보드에서 만든 링크의 추적용 쿼리 파라미터를
// 그대로 params에 넣는다 (예: { Allianceid: '123', SID: '456' } — 실제 이름은 대시보드 링크 기준).
// 비어 있으면 일반 검색 링크로 동작하고 제휴 고지도 표시하지 않는다.
export const AFFILIATE = {
  provider: '트립닷컴',
  params: {},
};

export const affiliateEnabled = () => Object.keys(AFFILIATE.params).length > 0;

// GoatCounter 사이트 코드 (예: 'yeonchagak' → https://yeonchagak.goatcounter.com).
// 비어 있으면 어떤 분석 요청도 보내지 않는다.
export const ANALYTICS = {
  goatcounterCode: '',
};

// 여행 검색 목적지. hotelCityId는 트립닷컴 숙소 목록 페이지에서 직접 확인한 값만 넣는다.
export const DESTINATIONS = [
  { id: 'tyo', name: '도쿄', from: 'sel', to: 'tyo', hotelCityId: 228 },
  { id: 'osa', name: '오사카', from: 'sel', to: 'osa', hotelCityId: 219 },
  { id: 'fuk', name: '후쿠오카', from: 'sel', to: 'fuk' },
  { id: 'tpe', name: '타이베이', from: 'sel', to: 'tpe' },
  { id: 'hkg', name: '홍콩', from: 'sel', to: 'hkg', hotelCityId: 58 },
  { id: 'dad', name: '다낭', from: 'sel', to: 'dad', hotelCityId: 1356 },
  { id: 'bkk', name: '방콕', from: 'sel', to: 'bkk' },
  { id: 'cju', name: '제주', from: 'sel', to: 'cju' },
];
