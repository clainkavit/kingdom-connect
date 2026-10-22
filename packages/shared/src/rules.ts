/** Business rules that are already decided in docs/prd.md. They live here so the member app, the admin console and the tests share one copy. */

export type MemberLevel = 1 | 2 | 3;

/** PRD section 9, criterion 3: at most 30 connection requests a day. */
export const DAILY_CONNECTION_REQUEST_LIMIT = 30;

/** PRD section 10, Types and responses: only Level 2 and up can respond to a tender. */
export function canRespondToTender(level: MemberLevel): boolean {
  return level >= 2;
}

/** PRD section 9, criterion 3. */
export function canSendConnectionRequest(requestsSentToday: number): boolean {
  return requestsSentToday < DAILY_CONNECTION_REQUEST_LIMIT;
}
