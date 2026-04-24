export const C = {
  primary: "#1B6CA8", primaryDark: "#134d7a", teal: "#3AAFA9",
  lavender: "#9B8EC4", green: "#27AE60", red: "#E74C3C",
  orange: "#F39C12", gray: "#6B7280", white: "#FFFFFF",
};

export const USER = {
  name: "김준호", employeeId: "2024-0381",
  position: "지도공상", department: "도피전안학", team: "외근담당",
};

export const LOCATIONS = [
  { id:1, name:"낙동강 제방 점검",  address:"사하구 장림동 123", status:"pending" },
  { id:2, name:"감천항 시설 확인",  address:"사하구 감천동 456", status:"complete" },
  { id:3, name:"다대포 해변 점검",  address:"사하구 다대동 789", status:"pending" },
  { id:4, name:"을숙도 생태공원",   address:"사하구 하단동 321", status:"pending" },
  { id:5, name:"괴정천 수질 확인",  address:"사하구 괴정동 654", status:"complete" },
];

export const REGION_DATA = [
  { region:"장림동", count:18, profit:3472, color:"#1B6CA8" },
  { region:"감천동", count:14, profit:2810, color:"#3AAFA9" },
  { region:"다대동", count:11, profit:2100, color:"#9B8EC4" },
  { region:"하단동", count:9,  profit:1650, color:"#5BA3D9" },
  { region:"괴정동", count:7,  profit:1320, color:"#7AC5BE" },
  { region:"신평동", count:5,  profit:980,  color:"#B8A8D8" },
];

export const MONTHLY = [
  { month:"9월",  revenue:980,  cost:820,  profit:160 },
  { month:"10월", revenue:1050, cost:870,  profit:180 },
  { month:"11월", revenue:1120, cost:910,  profit:210 },
  { month:"12월", revenue:1080, cost:950,  profit:130 },
  { month:"1월",  revenue:1261, cost:1113, profit:148 },
];

export const HEATMAP = [
  [3,5,2,7,4,6,1],[8,3,6,9,2,5,4],[2,7,4,3,8,1,6],
  [5,2,9,4,6,3,7],[1,8,3,6,2,9,4],[4,3,7,1,5,8,2],
];
export const DAYS  = ["월","화","수","목","금","토","일"];
export const WEEKS = ["1주","2주","3주","4주","5주","6주"];

export const MOCK_ENTRIES = [
  { id:1, name:"낙동강 제방 점검",  photos:["🌊","🏗️"], memo:"서티머 질드시사냥 멎새런이 알래어 진자...", status:"Pending" },
  { id:2, name:"감천항 시설 확인",  photos:["⚓","🏭"],  memo:"삼막지고 우민이 침해 성학이 같습니다.",  status:"Complete" },
  { id:3, name:"다대포 해변 점검",  photos:["🏖️"],       memo:"시설 상태 양호. 추가 점검 필요 없음.",   status:"Pending" },
];