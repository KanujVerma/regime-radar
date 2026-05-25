export const EVENTS = [
  { value: 'financial_crisis_2008', label: '2008 Financial Crisis' },
  { value: 'covid_2020', label: 'COVID-19 2020' },
  { value: 'tightening_2022', label: 'Rate Tightening 2022' },
] as const

export const EVENT_CONTENT: Record<string, { description: string; takeaway: string }> = {
  financial_crisis_2008: {
    description: 'The 2008 financial crisis saw SPY fall more than 50% from peak as credit markets seized.',
    takeaway: 'The model began flagging elevated risk roughly 3–4 weeks before the peak stress period. Risk stayed above the alert threshold for much of the window, reflecting the prolonged nature of the crisis rather than a single spike.',
  },
  covid_2020: {
    description: 'The COVID-19 market crash in early 2020 was one of the fastest equity declines on record.',
    takeaway: "This was the sharpest test — the model caught the transition but with less lead time than 2008, consistent with how rapidly conditions deteriorated. Peak risk reached the model's highest recorded readings during the window.",
  },
  tightening_2022: {
    description: 'The 2022 rate-tightening cycle saw aggressive Fed hikes as inflation reached 40-year highs.',
    takeaway: 'Unlike the prior two events, 2022 was a slow-burn elevated regime rather than a sudden crash. The model reflected this — risk stayed persistently moderate rather than spiking sharply, and the regime held Elevated for most of the year.',
  },
}
