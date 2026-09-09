export class TargetUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TargetUnavailableError";
  }
}
