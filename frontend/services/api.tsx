
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
    if (
      typeof error === 'object' &&
      error !== null &&
      'response' in error &&
      typeof (error as { response?: { status?: number } }).response === 'object' &&
      (error as { response?: { status?: number } }).response?.status === 401
    ) {
      return { loggedIn: false };
    }
    throw error;
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

export default api;
