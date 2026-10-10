export type Id = string;
/** 'YYYY-MM-DD'. The day a moment belongs to; days run 04:00 to 04:00 local time. */
export type DayKey = string;

export interface Label { id: Id; name: string; weekdays: number[]; position: number } // weekdays: 0=Mon .. 6=Sun
export interface Template { id: Id; name: string; labelId: Id; position: number }
export interface TemplateItem {
  id: Id; templateId: Id; kind: 'fixed' | 'slot'; name: string;
  position: number; sectionId?: Id; // sectionId only on slots. No start/end.
}
export interface Section { id: Id; name: string; position: number }
export interface Activity { id: Id; name: string }
export interface Listing { sectionId: Id; activityId: Id; position: number }
export interface JournalEntry {
  id: Id; activityId: Id; sectionId: Id; loggedAt: number; // epoch ms, recorded but never shown
  itemId?: Id;                     // the slot it was logged in, when known
  note?: string; durationMinutes?: number;
}
/** One row per day that has been touched. Confirmed means templateId is set. */
export interface DayRecord {
  day: DayKey; templateId?: Id; note?: string;
  chosenItemId?: Id; chosenAt?: number; // a slot picked by hand, and when (epoch ms)
}

export interface Snapshot {
  labels: Label[]; templates: Template[]; items: TemplateItem[]; // items sorted by position
  sections: Section[]; activities: Activity[]; listings: Listing[];
  journal: JournalEntry[]; days: DayRecord[]; defaultTemplateId: Id | null;
}
