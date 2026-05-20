'use client';

import { useState, useEffect } from 'react';

export interface UseClientIdReturn {
  clientId: string;
}

const STORAGE_KEY = 'ct_client_id';

export function useClientId(): UseClientIdReturn {
  const [clientId, setClientId] = useState('');

  useEffect(() => {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY, id);
    }
    setClientId(id);
  }, []);

  return { clientId };
}
