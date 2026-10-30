import { useEffect, useRef, useState } from 'react';
import { registerBulkRows } from '../../lib/bulkRegistration.js';
import { api } from '../../api/client.js';
import { detectBulkImportSettings } from '../../lib/bulkImportSettings.js';
import FilePicker from '../FilePicker.jsx';
import SelectionEmpty from '../SelectionEmpty.jsx';

export default function ExcelRegistration({ user, groupId, onSaved, onBusyChange }) {
  const workbook = useRef(null);
  const [sheets, setSheets] = useState([]), [sheet, setSheet] = useState(''), [raw, setRaw] = useState([]), [settings, setSettings] = useState(null), [corrections, setCorrections] = useState({}), [excluded, setExcluded] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  async function chooseSheet(name) {
    const XLSX = await import('xlsx');
    const values = XLSX.utils.sheet_to_json(workbook.current.Sheets[name], { header: 1, defval: '', blankrows: true, raw: false });
    setSheet(name); setRaw(values); setSettings(detectBulkImportSettings(values)); setCorrections({}); setExcluded([]);
  }
  async function read(event) {
    setBusy(true); setError('');
    try { const XLSX = await import('xlsx'); workbook.current = XLSX.read(await event.target.files[0].arrayBuffer(), { type: 'array' }); setSheets(workbook.current.SheetNames); await chooseSheet(workbook.current.SheetNames[0]); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const columns = Array.from({ length: Math.max(0, ...raw.map(row => row.length)) }, (_, i) => settings?.hasHeader ? String(raw[0]?.[i] || `${i + 1}열`) : `${i + 1}열`);
  const rows = settings ? raw.map((values, index) => ({ rowNumber: index + 1, name: settings.nameMode === 'fixed' ? settings.fixedName : settings.nameMode === 'column' ? String(values[settings.nameColumn] || '') : '', nameRequired: settings.nameMode !== 'default', roadAddress: settings.addressColumns.map(i => values[i]).filter(Boolean).join(settings.separator), detailAddress: String(values[settings.detailColumn] || ''), lat: String(values[settings.latColumn] || ''), lng: String(values[settings.lngColumn] || ''), ...corrections[index + 1] })).filter(row => !(settings.hasHeader && row.rowNumber === 1) && !excluded.includes(row.rowNumber) && Object.values(raw[row.rowNumber - 1]).some(value => String(value).trim())) : [];
  const update = (key, value) => { setSettings(old => ({ ...old, [key]: value })); setCorrections({}); };
  const column = (key, label) => <label>{label}<select className="input" value={settings[key]} onChange={e => update(key, Number(e.target.value))}><option value={-1}>선택 안 함</option>{columns.map((name, i) => <option value={i} key={i}>{name}</option>)}</select></label>;
  async function save() {
    setBusy(true); setError('');
    try {
      const result = await registerBulkRows(rows, locations => api.post('/api/locations/bulk', { createdByUserId: user.userId, groupId, locations }));
      setExcluded(old => [...old, ...result.savedRows]); setUncertain(result.uncertain);
      if (result.failures.length) setError(`${result.savedCount}건 등록 · ${result.failures.map(item => `${item.rowNumber}행: ${item.reason}`).join(' / ')}${result.uncertain ? ' · 지도를 열어 저장 여부를 확인해 주세요.' : ''}`);
      else onSaved();
    }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div className="registration-flow"><FilePicker title="엑셀 파일 선택" hint="XLSX · XLS · CSV" accept=".xlsx,.xls,.csv" disabled={busy || uncertain} onChange={read} />{!settings ? <SelectionEmpty icon="grid-outline">등록할 파일을 선택해 주세요</SelectionEmpty> : <><div className="import-settings">{sheets.length > 1 && <label>가져올 시트<select className="input" value={sheet} disabled={busy} onChange={e => chooseSheet(e.target.value)}>{sheets.map(name => <option key={name}>{name}</option>)}</select></label>}<label className="check-row"><input type="checkbox" checked={settings.hasHeader} onChange={e => update('hasHeader', e.target.checked)} />첫 행을 항목 이름으로 사용</label><label>방문지 이름<select className="input" value={settings.nameMode} onChange={e => update('nameMode', e.target.value)}><option value="default">자동으로 이름 정하기</option><option value="column">파일 항목에서 선택</option><option value="fixed">직접 입력</option></select></label>{settings.nameMode === 'column' && column('nameColumn', '이름 항목')}{settings.nameMode === 'fixed' && <input className="input" aria-label="방문지 이름 직접 입력" value={settings.fixedName} onChange={e => update('fixedName', e.target.value)} />}<fieldset><legend>도로명주소 항목</legend><div className="import-address-columns">{columns.map((name, i) => <label className="check-row" key={i}><input type="checkbox" checked={settings.addressColumns.includes(i)} onChange={() => update('addressColumns', settings.addressColumns.includes(i) ? settings.addressColumns.filter(id => id !== i) : [...settings.addressColumns, i])} />{name}</label>)}</div>{settings.addressColumns.length > 1 && <label>주소 연결<select className="input" value={settings.separator} onChange={e => update('separator', e.target.value)}><option value=" ">공백</option><option value=", ">쉼표</option><option value="">없음</option></select></label>}</fieldset>{column('detailColumn', '상세주소')}{column('latColumn', '위도')}{column('lngColumn', '경도')}</div><div className="table-scroll"><table className="table"><thead><tr><th>행</th>{['이름', '주소', '위도', '경도'].map(label => <th key={label}>{label}</th>)}<th>제외</th></tr></thead><tbody>{rows.map(row => <tr key={row.rowNumber}><td>{row.rowNumber}</td>{['name', 'roadAddress', 'lat', 'lng'].map(key => <td key={key}><input className="input" aria-label={`${row.rowNumber}행 ${key}`} value={row[key]} placeholder={key === 'name' ? '자동 이름' : ''} onChange={e => setCorrections(old => ({ ...old, [row.rowNumber]: { ...old[row.rowNumber], [key]: e.target.value } }))} /></td>)}<td><button className="icon-button" aria-label={`${row.rowNumber}행 제외`} onClick={() => setExcluded(old => [...old, row.rowNumber])}>×</button></td></tr>)}</tbody></table></div><button className="btn-primary btn-inline" disabled={busy || uncertain || !rows.length || settings.latColumn >= 0 && settings.latColumn === settings.lngColumn || settings.nameMode === 'column' && settings.nameColumn < 0 || settings.nameMode === 'fixed' && !settings.fixedName.trim()} onClick={save}>{busy ? '등록 중…' : `방문지 ${rows.length}곳 등록`}</button></>}{error && <p className="form-error" role="alert">{error}</p>}</div>;
}
