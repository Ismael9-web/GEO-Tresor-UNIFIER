

import axios from 'axios';

// Axios instance for API calls
const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  withCredentials: true,
  headers: {
    'Accept': 'application/json',
  },
});

// Check authentication status using new stateless endpoint
export const checkAuth = async () => {
  try {
    const response = await api.get('/check-auth');
    return response.data;
  } catch (error: unknown) {
    // Always return loggedIn: false for any error (network, 401, etc.)
    // Optionally log error for debugging
    if (process.env.NODE_ENV !== 'production') {
      console.error('checkAuth error:', error);
    }
    return { loggedIn: false };
  }
};

// Login using new stateless endpoint
export const login = async (username: string, password: string) => {
  const response = await api.post('/login', { username, password });
  // Store username in cookie for UI display
  if (response.data && response.data.username) {
    // Set cookie for 1 day
    document.cookie = `username=${encodeURIComponent(response.data.username)}; path=/; max-age=86400`;
  }
  return response.data;
};

// Logout using new stateless endpoint
export const logout = async () => {
  await api.post('/logout');
};

// Upload file for Fermeture de compte
export const fermetureDeCompte = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/fermeture-de-compte', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

// Fetch metadata for a document (shared utility)
export const fetchDocumentMetadata = async (docId: string) => {
  const res = await api.get(`/mayan/documents/${docId}/metadata`);
  return res.data?.data?.results || [];
};
// ...add other API functions as needed...
// Types for historique data
export interface HistoriqueDoc {
  docId: string;
  paymentDocId?: string;
  date?: string;
  total?: number;
  status?: string;
}
export interface HistoriqueMonth {
  mois: string;
  totalPaye: number;
  totalDePaiements: number;
  docs?: HistoriqueDoc[];
}

// Fetch historique data (monthly payment history)
export const fetchHistorique = async (): Promise<{ historique: HistoriqueMonth[] }> => {
  const response = await api.get('/historique');
  return response.data;
};


// Download document metadata as CSV
// Download document metadata as CSV
// docId should be the Document_ID from paymentDocId of the selected row
export const downloadDocumentCSV = async (paymentDocId: string) => {
  // Use paymentDocId as Document_ID for backend download
  const response = await api.get(`/download/${paymentDocId}`, { responseType: 'blob' });
  const blob = response.data;
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `document_${paymentDocId}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};

// Fetch document metadata CSV as text (for print)
// Fetch document metadata CSV as text (for print)
// docId should be the Document_ID from paymentDocId of the selected row
export const fetchDocumentCSVText = async (paymentDocId: string): Promise<string> => {
  // Use paymentDocId as Document_ID for backend download
  const response = await api.get(`/download/${paymentDocId}`, { responseType: 'text' });
  // If responseType: 'text' doesn't work, fallback to response.data as string
  if (typeof response.data === 'string') return response.data;
  // If response.data is a Blob, read as text
  if (response.data instanceof Blob) {
    return await response.data.text();
  }
  // Fallback: try to stringify
  return String(response.data);
};

export default api;