async function fetchOk(url: string, label: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not load ${label} (${url}): ${res.status} ${res.statusText}`);
  }
  return res;
}

export async function fetchJsonFile<T>(url: string, label: string): Promise<T> {
  const res = await fetchOk(url, label);
  return (await res.json()) as T;
}

export async function fetchTextFile(url: string, label: string): Promise<string> {
  const res = await fetchOk(url, label);
  return res.text();
}

/** Try filenames in order; return null if none exist. */
export async function fetchFirstText(
  baseDir: string,
  candidates: string[],
  _label: string
): Promise<string | null> {
  for (const name of candidates) {
    const url = `${baseDir}/${name}`;
    const res = await fetch(url);
    if (res.ok) return res.text();
  }
  return null;
}

export async function fetchFirstJson<T>(
  baseDir: string,
  candidates: string[],
  _label: string
): Promise<T | null> {
  for (const name of candidates) {
    const url = `${baseDir}/${name}`;
    const res = await fetch(url);
    if (res.ok) return (await res.json()) as T;
  }
  return null;
}

/** Required: throws if no candidate file exists. */
export async function fetchRequiredJson<T>(
  baseDir: string,
  candidates: string[],
  label: string
): Promise<T> {
  const data = await fetchFirstJson<T>(baseDir, candidates, label);
  if (data == null) {
    throw new Error(
      `${label}: missing file in ${baseDir}. Expected one of: ${candidates.join(", ")}`
    );
  }
  return data;
}

export async function fetchRequiredText(
  baseDir: string,
  candidates: string[],
  label: string
): Promise<string> {
  const text = await fetchFirstText(baseDir, candidates, label);
  if (text == null) {
    throw new Error(
      `${label}: missing file in ${baseDir}. Expected one of: ${candidates.join(", ")}`
    );
  }
  return text;
}
