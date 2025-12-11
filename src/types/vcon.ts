/**
 * VCON (Virtual Conversation) Types
 * Based on IETF draft-ietf-vcon-vcon-container
 * https://ietf-wg-vcon.github.io/draft-ietf-vcon-vcon-container/draft-ietf-vcon-vcon-container.html
 */

/** Civic address for party geolocation */
export interface CivicAddress {
  country?: string;
  a1?: string;
  a2?: string;
  a3?: string;
  a4?: string;
  a5?: string;
  a6?: string;
  prd?: string;
  pod?: string;
  sts?: string;
  hno?: string;
  hns?: string;
  lmk?: string;
  loc?: string;
  flr?: string;
  nam?: string;
  pc?: string;
}

/** Role of a party in the conversation */
export type PartyRole =
  | "agent"
  | "customer"
  | "supervisor"
  | "sme"
  | "thirdparty";

/** Party - a participant in the conversation */
export interface Party {
  tel?: string;
  mailto?: string;
  name?: string;
  stir?: string;
  validation?: string;
  uuid?: string;
  role?: PartyRole;
  gmlpos?: string;
  civicaddress?: CivicAddress;
  timezone?: string;
  contact_list?: string;
}

/** Dialog type - the kind of conversation element */
export type DialogType = "recording" | "text" | "transfer" | "incomplete";

/** Party history event for tracking joins/drops */
export interface PartyHistoryEvent {
  event: "join" | "drop" | "hold" | "unhold" | "mute" | "unmute";
  party: number;
  time: string;
}

/** Dialog - a single element of conversation (recording, text, etc.) */
export interface Dialog {
  type: DialogType;
  start: string;
  duration?: number;
  parties: number | number[];
  originator?: number;
  mediatype?: string;
  filename?: string;
  body?: string;
  encoding?: "base64url" | "json" | "none";
  url?: string;
  content_hash?: string | string[];
  disposition?: string;
  party_history?: PartyHistoryEvent[];
  campaign?: string;
  interaction_type?: string;
  interaction_id?: string;
  skill?: string;
  application?: string;
  message_id?: string;
  // Transfer-specific fields
  transferee?: number;
  transferor?: number;
  transfer_target?: number;
  original?: number;
  consultation?: number;
  target_dialog?: number;
}

/** Analysis type - the kind of derived data */
export type AnalysisType =
  | "summary"
  | "transcript"
  | "translation"
  | "sentiment"
  | "tts"
  | "wtf_transcription";

/** Analysis - derived data from the conversation */
export interface Analysis {
  type: AnalysisType | string;
  dialog?: number | number[];
  mediatype?: string;
  filename?: string;
  vendor: string;
  product?: string;
  schema?: string;
  body?: string | object;
  encoding?: "base64url" | "json" | "none";
  url?: string;
  content_hash?: string | string[];
}

/** Attachment - related documents */
export interface Attachment {
  type?: string;
  start?: string;
  party?: number;
  mediatype: string;
  filename?: string;
  body?: string;
  encoding?: "base64url" | "json" | "none";
  url?: string;
  content_hash?: string | string[];
  dialog?: number;
}

/** Group - aggregation of related vCons */
export interface VconGroup {
  uuid: string;
  vcon?: Vcon;
  url?: string;
}

/** Redacted reference */
export interface Redacted {
  uuid: string;
  vcon?: Vcon;
  url?: string;
}

/** Appended reference */
export interface Appended {
  uuid: string;
  vcon?: Vcon;
  url?: string;
}

/** Main VCON container */
export interface Vcon {
  vcon: string;
  uuid: string;
  created_at: string;
  updated_at?: string;
  subject?: string;
  parties: Party[];
  dialog?: Dialog[];
  analysis?: Analysis[];
  attachments?: Attachment[];
  group?: VconGroup[];
  redacted?: Redacted;
  appended?: Appended;
}

/** VCON with guaranteed arrays (after normalization) */
export interface NormalizedVcon extends Vcon {
  dialog: Dialog[];
  analysis: Analysis[];
  attachments: Attachment[];
}
