import { REGIONS, DISTRICTS_BY_REGION, childDistricts, selectWorkRegion } from '../lib/workRegion.js';
export default function WorkRegionFields({
  value,
  onChange,
  disabled = false, label = '근무지역'
}) {
  const children = childDistricts(value);
  return <fieldset className="region-fields" disabled={disabled}><legend>{label}</legend><label>시·도<select className="input" value={value.sido} onChange={e => onChange(selectWorkRegion(value, 'sido', e.target.value))}><option value="">선택해주세요</option>{REGIONS.map(v => <option key={v}>{v}</option>)}</select></label><label>시·군·구<select className="input" disabled={!value.sido} value={value.sigungu} onChange={e => onChange(selectWorkRegion(value, 'sigungu', e.target.value))}><option value="">선택해주세요</option>{(DISTRICTS_BY_REGION[value.sido] || []).map(v => <option key={v}>{v}</option>)}</select></label>{children.length > 0 && <label>구<select className="input" value={value.gu} onChange={e => onChange(selectWorkRegion(value, 'gu', e.target.value))}><option value="">선택해주세요</option>{children.map(v => <option key={v}>{v}</option>)}</select></label>}<button type="button" className="btn-secondary" onClick={() => onChange({
      sido: '',
      sigungu: '',
      gu: ''
    })}>선택 해제</button></fieldset>;
}
