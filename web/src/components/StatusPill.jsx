import { STATUS, STATUS_LABEL } from '../utils/taskStatus.js';

const TONE = {
  [STATUS.PENDING]: 'red',
  [STATUS.WORKING]: 'amber',
  [STATUS.COMPLETE]: 'green',
};

export default function StatusPill({ status }) {
  return <span className={`pill pill-${TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}
