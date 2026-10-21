// 보고서 탭(F7)과 그룹 '건별 보고서'가 같이 쓰는 받기 상태·받기·폴더 열기.
// 상태는 progressId 기준: 'new' = 받은 적 없음, 'saved' = 받은 그대로, 'changed' = 받은 뒤 고쳐짐.
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { showAlert } from '../components/CustomAlert';
import { downloadReportToFolder, downloadStateOf, openDownloadsFolder } from './reportDownloadState';

export function useReportDownloads(userId, reports) {
  const [states, setStates] = useState({});
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useState(null);
  const busy = useRef(false); // 같은 순간 두 번 눌러도 한 번만 받기
  const mounted = useRef(true);
  const toastTimer = useRef(null);
  useEffect(() => () => { mounted.current = false; clearTimeout(toastTimer.current); }, []);
  useEffect(() => {
    let active = true;
    const rows = (reports || []).filter(report => report?.progressId);
    Promise.all(rows.map(async report => [String(report.progressId), await downloadStateOf(userId, report)]))
      .then(pairs => { if (active) setStates(Object.fromEntries(pairs)); });
    return () => { active = false; };
  }, [reports, userId]);

  const stateOf = report => states[String(report?.progressId)] || 'new';

  const openFolder = async () => {
    const opened = await openDownloadsFolder().catch(() => false);
    if (!opened) showAlert('폴더 열기', '내 파일에서 Download → 외근도우미 → 다운로드 폴더를 확인해 주세요.');
  };

  /** 안드로이드: 받아서 다운로드/외근도우미 에 저장. 받은 progressId 목록을 돌려준다. 그 밖의 기기는 fallback(rows). */
  const download = async (rows, { label, fallback } = {}) => {
    if (!rows.length || busy.current) return [];
    if (Platform.OS !== 'android') {
      fallback?.(rows);
      return [];
    }
    busy.current = true;
    setDownloading(true);
    const saved = [];
    let failed = 0;
    let firstError = '';
    try {
      for (const report of rows) {
        if (!mounted.current) break; // 화면을 떠나면 남은 건은 받지 않는다
        try {
          await downloadReportToFolder(userId, report);
          saved.push(report.progressId);
        } catch (error) {
          failed++;
          firstError ||= error?.message || '';
        }
      }
    } finally {
      busy.current = false;
      if (mounted.current) {
        setDownloading(false);
        if (saved.length) {
          setStates(current => ({ ...current, ...Object.fromEntries(saved.map(id => [String(id), 'saved'])) }));
          clearTimeout(toastTimer.current);
          setToast({ text: rows.length === 1 && label ? `${label} 저장됨` : `${saved.length}건 저장 · 다운로드/외근도우미` });
          toastTimer.current = setTimeout(() => { if (mounted.current) setToast(null); }, 4000);
        }
        if (failed) showAlert('일부 보고서를 받지 못했어요', `${failed}건을 받지 못했습니다.${firstError ? `\n${firstError}` : ''} 다시 시도해 주세요.`);
      }
    }
    return saved;
  };

  return { states, stateOf, downloading, busy, toast, download, openFolder };
}

/** 고른 보고서들의 상태 수: '새로 1 · 고쳐짐 1 · 받은 적 있음 2' */
export function downloadCountText(rows, stateOf) {
  const counts = rows.reduce((acc, row) => {
    const state = stateOf(row);
    acc[state] = (acc[state] || 0) + 1;
    return acc;
  }, {});
  return [['new', '새로'], ['changed', '고쳐짐'], ['saved', '받은 적 있음']]
    .filter(([key]) => counts[key]).map(([key, label]) => `${label} ${counts[key]}`).join(' · ');
}
