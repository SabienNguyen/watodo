import type { NotifySettings } from './notify'

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
export interface Bond { id: Id; name: string; position: number; catchUpDays?: number } // catchUpDays: whole days >= 1
export interface Company { entryId: Id; bondId: Id }                                     // one row per entry and bond
export interface Activity { id: Id; name: string; committed: boolean; restDays?: number; temporary?: boolean } // committed: logging it spends the slot. restDays: whole days >= 1; absent = never rests. temporary: created for a while; true only
export interface Listing { sectionId: Id; activityId: Id; position: number; until?: DayKey } // until: last day it is in the slot; absent = for good
export interface JournalEntry {
  id: Id; activityId: Id; sectionId: Id; loggedAt: number; // epoch ms, recorded but never shown
  itemId?: Id;                     // the slot it was logged in, when known
  throughItemId?: Id;              // on a committed entry: the last slot item it spends (inclusive). Absent, or the own slot, means just that slot
  committed?: boolean;             // this entry spent its slot (copied from the activity when logged)
  note?: string; durationMinutes?: number;
}
/** One row per day that has been touched. Confirmed means templateId is set. */
export interface DayRecord {
  day: DayKey; templateId?: Id; note?: string;
  chosenItemId?: Id; chosenAt?: number; // a slot picked by hand, and when (epoch ms)
}

/** One step of a template being edited. A slot is named by its section, not by an item name. */
export type DraftStep =
  | { kind: 'fixed'; name: string; itemId?: Id }
  | { kind: 'slot'; slotName: string; itemId?: Id };   // itemId: the existing item this step came from, when editing
/** A template as it is being created, copied or edited. Nothing is stored until it is saved. */
export interface TemplateDraft {
  templateId?: Id;                                      // set when editing an existing template
  name: string;
  label: { id: Id } | { newName: string; weekdays: number[] };
  steps: DraftStep[];
}

export interface Snapshot {
  labels: Label[]; templates: Template[]; items: TemplateItem[]; // items sorted by position
  sections: Section[]; activities: Activity[]; listings: Listing[];
  bonds: Bond[];                       // live, by position
  company: Company[];
  journal: JournalEntry[]; days: DayRecord[]; defaultTemplateId: Id | null;
  // activities, sections and templates hold live rows only; removed holds deleted rows, kept for their names
  removed: { activities: Activity[]; sections: Section[]; templates: Template[]; bonds: Bond[] };
  notify?: NotifySettings;             // absent = DEFAULT_NOTIFY
}
