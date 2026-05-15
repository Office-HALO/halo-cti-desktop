export const BOOKING_STATUS = {
  reserved:  { bg: 'oklch(0.93 0.06 245)', line: 'oklch(0.58 0.15 245)', label: '予約'       },
  received:  { bg: 'oklch(0.94 0.07 150)', line: 'oklch(0.64 0.13 150)', label: '受領済'     },
  working:   { bg: 'oklch(0.94 0.06 50)',  line: 'oklch(0.68 0.13 50)',  label: '対応中'     },
  complete:  { bg: 'oklch(0.94 0.02 245)', line: 'oklch(0.72 0.02 245)', label: '完了'       },
  hold:      { bg: 'oklch(0.95 0.04 15)',  line: 'oklch(0.70 0.15 15)',  label: '仮予約'     },
  cancelled: { bg: 'oklch(0.94 0.05 25)',  line: 'oklch(0.64 0.18 25)',  label: 'キャンセル' },
};
