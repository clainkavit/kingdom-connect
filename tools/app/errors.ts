/** A failure the agent can act on: `fix` says what to do next. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly fix: string,
  ) {
    super(message);
  }
}
