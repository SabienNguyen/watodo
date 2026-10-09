export type Id = string;
/** 'YYYY-MM-DD'. The day a moment belongs to; days run 04:00 to 04:00 local time. */
export type DayKey = string;
/** Minutes since that day's local midnight: 240 (04:00) up to 1679 (03:59 next morning). */
export type DayMinutes = number;

export interface Label { id: Id; name: string; weekdays: number[]; position: number } // weekdays: 0=Mon .. 6=Sun
export interface Template { id: Id; name: string; labelId: Id; position: number }
export interface TemplateItem {
  id: Id; templateId: Id; kind: 'fixed' | 'slot'; name: string;
  start: DayMinutes; end: DayMinutes; sectionId?: Id; // sectionId only on slots
}
export interface Section { id: Id; name: string; position: number }
export interface Activity { id: Id; name: string }
export interface Listing { sectionId: Id; activityId: Id; position: number }
export interface JournalEntry {
  id: Id; activityId: Id; sectionId: Id; loggedAt: number; // epoch ms
  note?: string; durationMinutes?: number;
}
/** One row per day that has been touched. Confirmed means templateId is set. */
export interface DayRecord { day: DayKey; templateId?: Id; earlyItemId?: Id; note?: string }

export interface Snapshot {
  labels: Label[]; templates: Template[]; items: TemplateItem[];
  sections: Section[]; activities: Activity[]; listings: Listing[];
  journal: JournalEntry[]; days: DayRecord[]; defaultTemplateId: Id | null;
}
