export function assertRecord<T>(record: T | undefined, message: string): T {
  if (!record) {
    throw { status: 404, message };
  }

  return record;
}
