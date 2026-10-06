import { useCallback, useEffect, useState } from "react";

import {
  api,
  ApiError,
  type Group,
  type Organization,
  type Practice,
  type Student,
  type Supervisor,
} from "./api";

export interface Dictionaries {
  groups: Group[];
  students: Student[];
  organizations: Organization[];
  supervisors: Supervisor[];
  practices: Practice[];
}

const EMPTY: Dictionaries = {
  groups: [],
  students: [],
  organizations: [],
  supervisors: [],
  practices: [],
};

export interface DictionaryState extends Dictionaries {
  loading: boolean;
  loaded: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function describeFailure(reason: unknown): string {
  if (reason instanceof ApiError) {
    return reason.message;
  }
  if (reason instanceof TypeError) {
    return "сервер недоступен";
  }
  return "неизвестная ошибка";
}

/**
 * Loads all five dictionaries in parallel and reloads them after a mutation so
 * selects never show stale data. `allSettled` is deliberate: one broken
 * endpoint must not wipe out the four that succeeded.
 */
export function useDictionaries(): DictionaryState {
  const [data, setData] = useState<Dictionaries>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [groups, students, organizations, supervisors, practices] =
      await Promise.allSettled([
        api.getGroups(),
        api.getStudents(),
        api.getOrganizations(),
        api.getSupervisors(),
        api.getPractices(),
      ]);

    setData({
      groups: groups.status === "fulfilled" ? groups.value : EMPTY.groups,
      students: students.status === "fulfilled" ? students.value : EMPTY.students,
      organizations:
        organizations.status === "fulfilled" ? organizations.value : EMPTY.organizations,
      supervisors:
        supervisors.status === "fulfilled" ? supervisors.value : EMPTY.supervisors,
      practices: practices.status === "fulfilled" ? practices.value : EMPTY.practices,
    });

    const failures = [groups, students, organizations, supervisors, practices]
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => describeFailure(result.reason));

    setError(failures.length > 0 ? failures.join("; ") : null);
    setLoaded(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...data, loading, loaded, error, refresh };
}