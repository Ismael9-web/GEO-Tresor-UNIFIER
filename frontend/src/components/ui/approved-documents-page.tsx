import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import api, { logout } from "../../../services/api";
import budgetLogo from "@/assets/favicon.svg";
import Cookies from "js-cookie";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { exportTableToPDF } from "../ui/export-table-to-pdf";
import PaymentVoucherForm from "../forms/PaymentVoucherForm";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fetchHistorique as fetchHistoriqueApi } from '../../../services/api';
// Fetch metadata for a document
const fetchDocumentMetadata = async (docId: string) => {
  const res = await api.get(`/mayan/documents/${docId}/metadata`);
  return res.data?.data?.results || [];
};


// Get username from cookie (if available)
function getUsername() {
  return Cookies.get("username") || "Utilisateur";
}
// French date and number formatting helpers
function formatDateFr(dateStr?: string) {
  if (!dateStr) return "";
  // Accept ISO, dd-mm-yyyy, dd/mm/yyyy
  let d: Date | null = null;
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
    // dd-mm-yyyy
    const [day, month, year] = dateStr.split("-");
    d = new Date(Number(year), Number(month) - 1, Number(day));
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    // dd/mm/yyyy
    const [day, month, year] = dateStr.split("/");
    d = new Date(Number(year), Number(month) - 1, Number(day));
  } else {
    d = new Date(dateStr);
  }
  if (!d || isNaN(d.getTime())) return dateStr;
  // Always output dd/mm/yyyy
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}
function formatMoneyFr(val?: string) {
  if (!val) return "";
  // Remove all non-digit, non-comma, non-dot chars, then parse
  const cleaned = String(val).replace(/[^\d,.]/g, '');
  const num = parseFloat(cleaned.replace(/\s/g, '').replace(',', '.'));
  if (isNaN(num)) return val;
  // Always output French format: space for thousands, comma for decimals, 2 decimals
  return num
    .toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true
    })
    .replace(/\u00A0/g, ' ');
}

// Helper to check if a date string (in any supported format) is before today
function isDateExpired(dateStr?: string | null) {
  if (!dateStr) return false;
  let d: Date | null = null;
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
    const [day, month, year] = dateStr.split("-");
    d = new Date(Number(year), Number(month) - 1, Number(day));
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [day, month, year] = dateStr.split("/");
    d = new Date(Number(year), Number(month) - 1, Number(day));
  } else {
    d = new Date(dateStr);
  }
  if (!d || isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0,0,0,0);
  return d < today;
}

interface RowData {
  [key: string]: string;
}

// Define types for historique data
interface HistoriqueDoc {
  docId: string;
  paymentDocId?: string;
  date?: string;
  total?: number;
  status?: string;
}
interface HistoriqueMonth {
  mois: string;
  totalPaye: number;
  totalDePaiements: number;
  docs: HistoriqueDoc[];
}

export default function ApprovedDocumentsPage() {
  // State for sliding detail panel
  const [showDetailPanel, setShowDetailPanel] = useState(false);
  const navigate = useNavigate();
  const [showPaymentSheet, setShowPaymentSheet] = useState(false);
  // Edit drawer and metadata state (moved here from top-level)
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [editMetadata, setEditMetadata] = useState<Array<{ id: string; value: string; editable: boolean; metadata_type?: { label?: string; name?: string } }> | null>(null);
  const [editRow, setEditRow] = useState<RowData | null>(null);
  // Store edited values for all editable fields
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [editLoading, setEditLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [prefillData, setPrefillData] = useState<Record<string, string> | null>(null);
  const [data, setData] = useState<RowData[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Use unique row IDs for selection
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [showHistorique, setShowHistorique] = useState(false);
  const [historiqueData, setHistoriqueData] = useState<HistoriqueMonth[]>([]);
  const [selectedMonthIdx, setSelectedMonthIdx] = useState<number | null>(null);
  const [loadingHistorique, setLoadingHistorique] = useState(false);

  // Fetch historique data from backend
  const fetchHistorique = async () => {
    setLoadingHistorique(true);
    try {
      const res = await fetchHistoriqueApi();
      setHistoriqueData(res.historique as HistoriqueMonth[] || []);
    } catch {
      setHistoriqueData([]);
    } finally {
      setLoadingHistorique(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    api.get("/approved_documents_metadata")
      .then((res) => {
        if (!res.data || !res.data.columns || !res.data.rows) {
          console.error('Invalid response format:', res.data);
          throw new Error('Invalid response format from server');
        }
        // Filter out internal fields from visible columns
        const visibleLabels = res.data.columns.filter((col: string) => 
          col !== 'canEdit' && col !== 'Statut' && col !== 'id'
        );
        setLabels(visibleLabels);
        setVisibleColumns(visibleLabels); // Only show visible columns by default
        setData(res.data.rows);
        setLoading(false);
      })
      .catch((err) => {
        setLoading(false);
        if (err?.response?.status === 401) {
          // Clear cookies and redirect to login
          Cookies.remove("tresor_csrftoken", { path: "/" });
          Cookies.remove("tresor_auth", { path: "/" });
          Cookies.remove("username", { path: "/" });
          navigate("/login");
        }
      });
  }, [navigate]);


  // Logout handler
  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Failed to logout:', error);
    } finally {
      // Always clear cookies on client side for robustness
      Cookies.remove("tresor_csrftoken", { path: "/" });
      Cookies.remove("tresor_auth", { path: "/" });
      Cookies.remove("username", { path: "/" });
      navigate("/login");
    }
  };

  // Filtering
  const filteredData = data.filter((row) =>
    labels.some((col) => row[col]?.toLowerCase().includes(search.toLowerCase()))
  );

  // Sorting
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const sortedData = useMemo(() => {
    if (!sortBy) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortBy] || '';
      const bVal = b[sortBy] || '';
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortBy, sortDir]);

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const pageCount = Math.ceil(sortedData.length / pageSize);
  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, page, pageSize]);

  // Reset page to 1 when filtered/sorted data changes
  useEffect(() => {
    setPage(1);
  }, [search, sortBy, sortDir, data.length]);

  // Column visibility toggle
  const handleToggleColumn = (col: string) => {
    setVisibleColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  // Row selection
  // Selection by unique row ID
  const getRowId = (row: RowData) => row.id || row['ID'] || row['Id'] || JSON.stringify(row);
  const handleSelectRow = (rowId: string) => {
    setSelectedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(rowId)) {
        newSet.delete(rowId);
      } else {
        newSet.add(rowId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (paginatedData.every((row) => selectedRows.has(getRowId(row)))) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(paginatedData.map(getRowId)));
    }
  };

  // Handler for successful voucher submission
  const handleVoucherSuccess = async () => {
    setShowPaymentSheet(false);
    setShowModal(true);
    // Refresh table data after successful payment
    setLoading(true);
    try {
      const res = await api.get("/approved_documents_metadata");
      setData(res.data.rows);
    } finally {
      setLoading(false);
    }
  };

return (
  <>
    <div className="min-h-screen w-full flex flex-col justify-between bg-gray-50">
      <header className="w-full flex flex-col md:flex-row items-center justify-between py-2 px-8 bg-white/90 shadow gap-4 sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <img src={budgetLogo} alt="Logo Ministère du Budget" className="h-12 w-auto rounded shadow" />
          <h1 className="text-xl font-bold text-gray-800">Liste de bénéficiaires de la pension alimentaire</h1>
        </div>
        <div className="flex gap-4 items-center">
          <span className="text-gray-700 text-sm">Connecté en tant que <span className="font-semibold">{getUsername()}</span></span>
          <button
            className="px-3 py-1 rounded bg-red-500 text-white text-sm hover:bg-red-700"
            onClick={handleLogout}
          >
            Se déconnecter
          </button>
        </div>
      </header>
      
      <div className="flex-1 flex flex-col items-center justify-start w-full">
        <div className="w-full flex flex-col gap-2 px-2 md:px-8 lg:px-16 xl:px-32">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mt-4 mb-2">
            <div className="flex gap-2 items-center w-full md:w-auto">
              <Input
                name="search"
                placeholder="Rechercher..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="max-w-xs h-8"
              />
              <button
                className="px-2 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-700 w-28 min-w-[7rem]"
                onClick={() => exportTableToPDF(visibleColumns, sortedData)}
              >
                <span className="text-xs">Exporter PDF</span>
              </button>
              
              {/* Column visibility dropdown */}
              <div className="relative group">
                <button className="px-2 py-1 rounded bg-gray-200 text-gray-700 text-xs hover:bg-gray-300">Colonnes</button>
                <div className="absolute z-10 left-0 mt-1 w-36 bg-white border rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
                  {labels.map((col) => (
                    <label key={col} className="flex items-center px-2 py-1 cursor-pointer hover:bg-gray-100">
                      <input
                        type="checkbox"
                        checked={visibleColumns.includes(col)}
                        onChange={() => handleToggleColumn(col)}
                        className="mr-2"
                      />
                      {col.charAt(0).toUpperCase() + col.slice(1)}
                    </label>
                  ))}
                </div>
              </div>
              
              {/* HISTORIQUE DIALOG/MODAL BLOCK START */}
              <Dialog open={showHistorique} onOpenChange={setShowHistorique}>
                <DialogTrigger asChild>
                  <button
                    className="px-2 py-1 rounded bg-gray-200 text-gray-700 text-xs hover:bg-gray-300"
                    style={{ fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 'normal' }}
                    onClick={() => {
                      setShowHistorique(true);
                      fetchHistorique();
                    }}
                  >
                    Historique
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <div className="font-bold text-lg mb-4">Historique des paiements 2025</div>
                  <div className="flex flex-col md:flex-row gap-2 w-full transition-all duration-300">
                    {/* Main Table Area */}
                    <div className={`transition-all duration-300 ${showDetailPanel ? 'md:w-3/5 w-full' : 'w-full'}`}>
                      {loadingHistorique ? (
                        <div className="text-center py-8">Chargement...</div>
                      ) : (
                        <table className="w-full border text-xs">
                          <thead>
                            <tr className="bg-gray-100">
                              <th className="px-2 py-2">Mois</th>
                              <th className="px-2 py-2">Total payé</th>
                              <th className="px-2 py-2">Total de paiements</th>
                              <th className="px-2 py-2">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {historiqueData.map((row, idx) => (
                              <tr key={row.mois} className="border-b">
                                <td className="px-2 py-2">{row.mois}</td>
                                <td className="px-2 py-2">{row.totalPaye}</td>
                                <td className="px-2 py-2">{row.totalDePaiements}</td>
                                <td className="px-2 py-2">
                                  <button
                                    className="px-2 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-700"
                                    onClick={() => {
                                      setSelectedMonthIdx(idx);
                                      setShowDetailPanel(true);
                                    }}
                                  >
                                    Voir
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                    
                    {/* Sliding Detail Panel */}
                    {showDetailPanel && selectedMonthIdx !== null && (
                      <div
                        className={`fixed md:static top-0 right-0 h-full md:h-auto bg-white shadow-lg z-50 transition-all duration-300 transform ${showDetailPanel ? 'translate-x-0 md:relative md:w-2/5 w-full' : 'translate-x-full md:translate-x-0 md:w-0 w-0'} flex flex-col`}
                        style={{ minWidth: showDetailPanel ? '320px' : '0', maxWidth: '100%', overflow: 'auto' }}
                        aria-label="Détails du mois"
                        role="region"
                        tabIndex={showDetailPanel ? 0 : -1}
                      >
                        <div className="p-4 flex flex-col h-full">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <h3 className="font-bold text-lg">{historiqueData[selectedMonthIdx]?.mois}</h3>
                              <div className="text-xs text-gray-600">Total payé : {historiqueData[selectedMonthIdx]?.totalPaye}</div>
                              <div className="text-xs text-gray-600">Total de paiements : {historiqueData[selectedMonthIdx]?.totalDePaiements}</div>
                            </div>
                            <Button size="icon" variant="ghost" aria-label="Fermer" onClick={() => { setShowDetailPanel(false); setSelectedMonthIdx(null); }}>
                              ×
                            </Button>
                          </div>
                          <div className="font-semibold mb-2">Documents pour {historiqueData[selectedMonthIdx]?.mois}</div>
                          <div className="overflow-x-auto">
                            <table className="w-full border text-xs mb-2">
                              <thead>
                                <tr>
                                  <th className="px-2 py-1">Document ID</th>
                                  <th className="px-2 py-1">Date</th>
                                  <th className="px-2 py-1">Montant</th>
                                  <th className="px-2 py-1">Statut</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(historiqueData[selectedMonthIdx]?.docs ?? []).length > 0 ? (
                                  historiqueData[selectedMonthIdx].docs.map((doc, i) => (
                                    <tr key={doc.docId || i}>
                                      <td className="px-2 py-1">{doc.docId}</td>
                                      <td className="px-2 py-1">{doc.date}</td>
                                      <td className="px-2 py-1">{doc.total}</td>
                                      <td className="px-2 py-1">{doc.status}</td>
                                    </tr>
                                  ))
                                ) : (
                                  <tr><td colSpan={4} className="text-center py-2 text-gray-400">Aucun document pour ce mois</td></tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
              {/* HISTORIQUE DIALOG/MODAL BLOCK END */}
            </div>
          </div>
          
          {/* Fixed Card with overridden padding and gap */}
          <Card className="w-full flex-1 bg-white/90 backdrop-blur-md shadow-lg p-0 py-0 gap-0">
            {loading ? (
              <div className="text-center py-4 text-gray-500">Chargement...</div>
            ) : (
              <>
                <div className="overflow-x-auto h-[calc(100vh-280px)]">
                  <table className="min-w-full h-full divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <input
                            type="checkbox"
                            checked={paginatedData.length > 0 && paginatedData.every((row) => selectedRows.has(getRowId(row)))}
                            onChange={handleSelectAll}
                            title="Tout sélectionner"
                            className="scale-75"
                          />
                        </th>
                        {visibleColumns.map((label) => {
                          // Determine if column is numeric
                          const normalizedLabel = label.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[-_ ]/g, '').toUpperCase();
                          const isNumeric = ["MONTANT", "MONTANTPARMOIS", "TOTALAPAYER"].includes(normalizedLabel);
                          return (
                            <th
                              key={label}
                              className={`px-2 py-1 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-200 ${isNumeric ? 'text-right' : 'text-left'}`}
                              onClick={() => {
                                if (sortBy === label) {
                                  setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                                } else {
                                  setSortBy(label);
                                  setSortDir('asc');
                                }
                              }}
                            >
                              {label.charAt(0).toUpperCase() + label.slice(1)}
                              {sortBy === label ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                            </th>
                          );
                        })}
                        <th className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
                        <th className="px-2 py-1 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {paginatedData.map((row, i) => {
                        let dateFin = null;
                        for (const key of Object.keys(row)) {
                          const normalized = key.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[-_ ]/g, '').toUpperCase();
                          if (normalized === "DATEFIN") {
                            dateFin = row[key];
                            break;
                          }
                        }
                        const expired = isDateExpired(dateFin);
                        const statut = row['Statut'] || 'pending';
                        return (
                          <tr key={i} className={`text-xs hover:bg-blue-50 transition-colors leading-tight ${
                                  selectedRows.has(i) ? 'bg-blue-100' : (i % 2 === 0 ? 'bg-gray-50' : 'bg-white')
                                } ${expired ? 'opacity-60 pointer-events-none' : ''}`}> 
                            <td className="px-2 py-0.5 text-center align-middle">
                              <input
                                type="checkbox"
                                checked={selectedRows.has(getRowId(row))}
                                onChange={() => handleSelectRow(getRowId(row))}
                                title="Sélectionner la ligne"
                                disabled={expired}
                                className="scale-75"
                              />
                            </td>
                            {visibleColumns.map((label) => {
                              let value = row[label];
                              const normalizedLabel = label.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[-_ ]/g, '').toUpperCase();
                              const isNumeric = ["MONTANT", "MONTANTPARMOIS", "TOTALAPAYER"].includes(normalizedLabel);
                              if (["DATEFIN", "DATEINITIAL"].includes(normalizedLabel)) {
                                value = formatDateFr(value);
                              } else if (["MONTANTPARMOIS", "TOTALAPAYER", "MONTANT"].includes(normalizedLabel)) {
                                value = formatMoneyFr(value);
                              }
                              return (
                                <td key={label} className={`px-2 py-0.5 whitespace-nowrap align-middle text-gray-700 leading-tight ${isNumeric ? 'text-right' : 'text-left'}`}> 
                                  {value}
                                </td>
                              );
                            })}
                            {/* Status column */}
                            <td className="px-2 py-0.5 text-center align-middle font-semibold">
                              {(statut === 'paid' || statut === 'payé') ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span
                                      className="text-green-600 text-xs underline cursor-pointer"
                                      onMouseEnter={async () => {
                                        // Fetch and cache metadata for tooltip
                                        if (!row._metadataTooltip) {
                                          const meta = await fetchDocumentMetadata(row.paymentDocId || row.id);
                                          row._metadataTooltip = meta;
                                          setData([...data]);
                                        }
                                      }}
                                    >
                                      payé
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <div className="text-left max-w-xs">
                                      {Array.isArray(row._metadataTooltip) ? (
                                        <ul>
                                          {row._metadataTooltip.map((meta: { id: string; value: string; metadata_type?: { label?: string; name?: string } }) => (
                                            <li key={meta.id}>
                                              <span className="font-semibold">{meta.metadata_type?.label || meta.metadata_type?.name}:</span> {meta.value}
                                            </li>
                                          ))}
                                        </ul>
                                      ) : row._metadataTooltip ? (
                                        <span>{row._metadataTooltip}</span>
                                      ) : (
                                        <span>Chargement...</span>
                                      )}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              ) : expired ? (
                                <span className="text-red-600 text-xs">expiré</span>
                              ) : (
                                <span className="text-yellow-600 text-xs">en attente</span>
                              )}
                            </td>
                            {/* Actions column */}
                            <td className="px-2 py-0.5 text-center align-middle">
                              {((statut === 'payé' || statut === 'paid') && !expired) ? (
                                <button
                                  className="px-2 py-0.5 rounded bg-black text-white text-xs font-semibold w-16 transition-colors duration-200"
                                  title="Modifier les métadonnées"
                                  onClick={async () => {
                                    // Fetch metadata for edit
                                    const meta = await fetchDocumentMetadata(row.paymentDocId || row.id);
                                    setEditMetadata(meta);
                                    setEditRow(row);
                                    setShowEditDrawer(true);
                                  }}
                                >
                                  Modifier
                                </button>
                              ) : (!expired && (
                                <button
                                  className="px-2 py-0.5 rounded bg-blue-600 text-white text-xs font-semibold w-16 transition-colors duration-200"
                                  onClick={() => {
                                    setPrefillData(row);
                                    setShowPaymentSheet(true);
                                  }}
                                >
                                  Payer
                                </button>
                              ))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {/* Pagination Controls */}
                <div className="flex justify-center items-center mt-2 pb-2">
                  <button
                    className="px-2 py-1 rounded bg-gray-200 disabled:opacity-50 mx-1 text-xs hover:bg-gray-300 transition-colors"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Précédent
                  </button>
                  <span className="mx-2 text-xs">
                    Page {page} sur {pageCount}
                  </span>
                  <button
                    className="px-2 py-1 rounded bg-gray-200 disabled:opacity-50 mx-1 text-xs hover:bg-gray-300 transition-colors"
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={page === pageCount}
                  >
                    Suivant
                  </button>
                </div>
              </>
            )}
          </Card>
        </div>
      </div>

      <footer className="w-full text-center py-2 text-gray-700 bg-white/80 mt-4">
        Ministère du Budget &copy; 2025
      </footer>
    </div>

    {/* Modal - moved outside of main container */}
    {showModal && (
      <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
        <div className="bg-white rounded-lg shadow-lg p-6 text-center">
          <div className="flex justify-center mb-3">
            <svg className="h-12 w-12 text-green-500 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="white" />
              <path stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" d="M8 12l2 2 4-4" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-3 text-green-600">Enregistré avec succès</h2>
          <p className="mb-4 text-sm">Le paiement a été soumis et archivé.</p>
          <button onClick={() => setShowModal(false)} className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 transition-colors">Fermer</button>
        </div>
      </div>
    )}

    {/* Drawer for editing metadata */}
    <Sheet open={showEditDrawer} onOpenChange={setShowEditDrawer}>
      <SheetContent side="right" className="bg-white/80 backdrop-blur-md shadow-2xl">
        <div className="p-2">
          <h2 className="text-lg font-semibold mb-4">Modifier les métadonnées</h2>
          {editMetadata && editRow ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setEditLoading(true);
                try {
                  if (editMetadata && editRow) {
                    const docId = editRow.paymentDocId || editRow.id;
                    // Find all editable fields that changed
                    const updates = editMetadata.filter((meta) => meta.editable && editValues[meta.id] !== undefined && editValues[meta.id] !== meta.value);
                    for (const meta of updates) {
                      await api.put(`/mayan/documents/${docId}/metadata/${meta.id}`, { value: editValues[meta.id] });
                    }
                    setShowEditDrawer(false);
                    setEditMetadata(null);
                    setEditRow(null);
                    setEditValues({});
                    // Refresh data
                    setLoading(true);
                    const res = await api.get("/approved_documents_metadata");
                    setData(res.data.rows);
                    setLoading(false);
                  }
                } catch {
                  alert("Erreur lors de la mise à jour des métadonnées");
                } finally {
                  setEditLoading(false);
                }
              }}
              className="space-y-4"
            >
              {editMetadata
                ?.filter((meta) => {
                  // Only allow editing for Montant, Date, Description, Payeur, Mode
                  const allowed = [
                    'Montant', 'Date', 'Description', 'Payeur', 'Mode',
                    'montant', 'date', 'description', 'payeur', 'mode',
                    'MONTANT', 'DATE', 'DESCRIPTION', 'PAYEUR', 'MODE',
                  ];
                  const label = meta.metadata_type?.label || meta.metadata_type?.name || '';
                  return allowed.includes(label);
                })
                .map((meta) => (
                  <div key={meta.id} className="mb-3">
                    <label className="block text-xs font-semibold mb-1">{meta.metadata_type?.label || meta.metadata_type?.name}</label>
                    <input
                      className={`w-full border rounded px-2 py-1 text-xs focus:ring-2 focus:ring-blue-400 ${meta.editable ? '' : 'bg-gray-100 text-gray-500'}`}
                      value={meta.editable ? (editValues[meta.id] ?? meta.value) : meta.value}
                      disabled={!meta.editable}
                      onChange={meta.editable ? (e) => setEditValues((vals) => ({ ...vals, [meta.id]: e.target.value })) : undefined}
                      placeholder={meta.metadata_type?.label || meta.metadata_type?.name}
                      title={meta.metadata_type?.label || meta.metadata_type?.name}
                    />
                  </div>
                ))}
              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-2 rounded mt-2 disabled:opacity-50 hover:bg-blue-700 transition-colors"
                disabled={editLoading}
              >
                {editLoading ? "Mise à jour..." : "Enregistrer"}
              </button>
            </form>
          ) : (
            <span>Chargement...</span>
          )}
        </div>
      </SheetContent>
    </Sheet>

    {/* Payment Sheet */}
    <Sheet open={showPaymentSheet} onOpenChange={setShowPaymentSheet}>
      <SheetContent side="right">
        <div className="p-2">
          <h2 className="text-lg font-semibold mb-4">Effectuer un paiement</h2>
          <PaymentVoucherForm
            prefill={prefillData || undefined}
            documentId={prefillData?.id}
            onSuccess={() => {
              handleVoucherSuccess();
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  </>
);
}
