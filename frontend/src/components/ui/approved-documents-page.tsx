import { useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import api, { logout } from "../../../services/api";
import budgetLogo from "@/assets/favicon.svg";
import Cookies from "js-cookie";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { exportTableToPDF } from "../ui/export-table-to-pdf";
import PaymentVoucherForm from "../forms/PaymentVoucherForm";

function getUsername() {
  return Cookies.get("username") || "Utilisateur";
}
function formatDateFr(dateStr?: string) {
  if (!dateStr) return "";
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
  if (!d || isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}
function formatMoneyFr(val?: string) {
  if (!val) return "";
  const cleaned = String(val).replace(/[^\d,.]/g, '');
  const num = parseFloat(cleaned.replace(/\s/g, '').replace(',', '.'));
  if (isNaN(num)) return val;
  return num
    .toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true
    })
    .replace(/\u00A0/g, ' ');
}
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

export default function ApprovedDocumentsPage() {
  const [showCloseAccountModal, setShowCloseAccountModal] = useState(false);
  const [closeAccountLoading, setCloseAccountLoading] = useState(false);
  const [closeAccountSuccess, setCloseAccountSuccess] = useState(false);
  const [closeAccountError, setCloseAccountError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  // State for expanded export menus
  const [expandedExportOP, setExpandedExportOP] = useState(false);
  const [expandedExportEmergement, setExpandedExportEmergement] = useState(false);
  const [caissierList, setCaissierList] = useState<string[]>([]);


  // State for expanded export menus
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showPaymentSheet, setShowPaymentSheet] = useState(false);
  const [showEditDrawer, setShowEditDrawer] = useState(false);
  const [editMetadata, setEditMetadata] = useState<Array<{ id: string; value: string; editable: boolean; metadata_type?: { label?: string; name?: string } }> | null>(null);
  const [editRow, setEditRow] = useState<RowData | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [editLoading, setEditLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [prefillData, setPrefillData] = useState<Record<string, string> | null>(null);
  const [data, setData] = useState<RowData[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const navigate = useNavigate();
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  const fetchDocumentMetadata = async (docId: string) => {
    const res = await api.get(`/mayan/documents/${docId}/metadata`);
    return res.data?.data?.results || [];
  };

  useEffect(() => {
    if (prefillData) {
      console.log('prefillData field names:', Object.keys(prefillData));
    }
  }, [prefillData]);

  useEffect(() => {
    setLoading(true);
    api.get("/approved_documents_metadata")
      .then((res) => {
        if (!res.data || !res.data.columns || !res.data.rows) {
          console.error('Invalid response format:', res.data);
          throw new Error('Invalid response format from server');
        }
        const visibleLabels = res.data.columns.filter((col: string) => 
          col !== 'canEdit' && col !== 'Statut' && col !== 'id'
        );
        setLabels(visibleLabels);
        setVisibleColumns(visibleLabels);
        setData(res.data.rows);
        setLoading(false);
      })
      .catch((err) => {
        setLoading(false);
        if (err?.response?.status === 401) {
          Cookies.remove("tresor_csrftoken", { path: "/" });
          Cookies.remove("tresor_auth", { path: "/" });
          Cookies.remove("username", { path: "/" });
          navigate("/login");
        }
      });
  }, [navigate]);

    // Dynamically build CAISSIER list from metadata
  useEffect(() => {
    async function fetchCaissierList() {
      try {
        // Get all document IDs from main data
        const docIds = data.map(row => row.paymentDocId || row.id).filter(Boolean);
        const caissiers = new Set<string>();
        for (const docId of docIds) {
          const meta = await fetchDocumentMetadata(docId);
          // Find CAISSIER value in metadata
          for (const m of meta) {
            if ((m.metadata_type?.label || m.metadata_type?.name || '').toUpperCase() === 'CAISSIER' && m.value) {
              caissiers.add(m.value.trim());
            }
          }
        }
        setCaissierList(Array.from(caissiers));
      } catch (e) {
        setCaissierList([]);
      }
    }
    if (data.length > 0) fetchCaissierList();
  }, [data]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Failed to logout:', error);
    } finally {
      Cookies.remove("tresor_csrftoken", { path: "/" });
      Cookies.remove("tresor_auth", { path: "/" });
      Cookies.remove("username", { path: "/" });
      navigate("/login");
    }
  };

  // const filteredData = data.filter((row) =>
  //   labels.some((col) => row[col]?.toLowerCase().includes(search.toLowerCase()))
  // );
    const normalizeForSearch = (str: string) =>
    str
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/gi, ''); // Remove non-alphanumeric chars

  const normalizedSearch = normalizeForSearch(search);

  const filteredData = useMemo(() =>
    data.filter((row) =>
      labels.some((col) => {
      let cell = (row[col] || "");
      // If column is a date, format to ddmmyyyy for search
      const normalizedLabel = col.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[-_ ]/g, '').toUpperCase();
      if (["DATEFIN", "DATEINITIAL", "DATE"].includes(normalizedLabel)) {
        cell = formatDateFr(cell);
      }
      return normalizeForSearch(cell).includes(normalizedSearch);
    })
    ), [data, labels, search]);

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

  const pageCount = Math.ceil(sortedData.length / pageSize);
  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, page, pageSize]);

  const handleToggleColumn = (col: string) => {
    setVisibleColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  const handleSelectRow = (rowIdx: number) => {
    setSelectedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(rowIdx)) {
        newSet.delete(rowIdx);
      } else {
        newSet.add(rowIdx);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (paginatedData.every((_, i) => selectedRows.has(i))) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(paginatedData.map((_, i) => i)));
    }
  };

  const handleVoucherSuccess = async () => {
    setShowPaymentSheet(false);
    setShowModal(true);
    setLoading(true);
    try {
      const res = await api.get("/approved_documents_metadata");
      setData(res.data.rows);
    } catch {
      // Optionally handle error
    } finally {
      setLoading(false);
    }
  };

  function exportTableToPDFEmergement(columns: string[], data: RowData[]) {
    const emergementCols = [...columns, 'Signature'];
    // Filter out expired or paid rows
    const emergementData = data
      .filter(row => {
        // Find Date-fin column
        const dateFinKey = Object.keys(row).find(k => k.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[-_ ]/g, '').toUpperCase() === 'DATEFIN');
        const isExpired = dateFinKey ? isDateExpired(row[dateFinKey]) : false;
        const statut = (row['Statut'] || '').toLowerCase();
        return !isExpired && statut !== 'payé' && statut !== 'paid';
      })
      .map(row => {
        const newRow: RowData = { ...row };
        newRow['Signature'] = '';
        return newRow;
      });
    exportTableToPDF(emergementCols, emergementData, 'Liste-Emergement.pdf');
  }

  return (
    <>
      <div className="min-h-screen w-full flex flex-col bg-gray-50">
        <header className="w-full flex flex-col md:flex-row items-center justify-between py-2 px-8 bg-white/90 shadow gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <img src={budgetLogo} alt="Logo Ministère du Budget" className="h-12 w-auto rounded shadow" />
            <h1 className="text-xl font-bold text-gray-800">Liste de bénéficiaires de la PA</h1>
          </div>
          <div className="flex gap-4 items-center">
        <span className="text-gray-700 text-sm">Connecté en tant que <span className="font-semibold">{getUsername() !== "Utilisateur" ? getUsername() : (Cookies.get("username") || "")}</span></span>
            <button
              className="px-3 py-1 rounded bg-red-500 text-white text-sm hover:bg-red-700"
              onClick={handleLogout}
            >
              Se déconnecter
            </button>
         <button
           className="px-3 py-1 rounded bg-orange-500 text-white text-sm hover:bg-orange-700"
           onClick={() => setShowCloseAccountModal(true)}
         >
           Fermeture du compte
         </button>
          </div>
        </header>
        <div className="w-full px-8 pb-2 bg-white/90 shadow">
          <div className="flex flex-row items-center gap-2 mb-2">
            <div className="relative inline-block">
              <button
                className="px-2 py-1 rounded bg-blue-600 text-white text-xs min-w-[7rem] flex items-center justify-between"
                onClick={() => setShowExportMenu((v) => !v)}
                type="button"
              >
                <span className="text-xs">Exporter PDF</span>
                <span className="ml-1">{showExportMenu ? '▲' : '▼'}</span>
              </button>
              {showExportMenu && (
                <div
                  className="absolute left-0 mt-1 w-56 bg-white border rounded shadow-lg z-50"
                  onMouseLeave={() => {
                    setShowExportMenu(false);
                    setExpandedExportOP(false);
                    setExpandedExportEmergement(false);
                  }}
                  onMouseEnter={() => setShowExportMenu(true)}
                >
                  {/* // ...existing code... */}
                    {/* Exporter OP with sub-options by CAISSIER */}
                    <div className="border-b">
                      <div
                        className="flex items-center justify-between px-3 py-2 text-xs font-semibold cursor-pointer hover:bg-gray-100"
                        onClick={() => setExpandedExportOP((v) => !v)}
                        style={{ userSelect: 'none' }}
                      >
                        <span>Exporter OP</span>
                        <span>{expandedExportOP ? '▼' : '▶'}</span>
                      </div>
                      {expandedExportOP && (
                        <div className="pl-2">
                          {caissierList.map(caissier => (
                            <button
                              key={caissier}
                              className="w-full px-3 py-2 text-left hover:bg-blue-50 text-xs"
                              type="button"
                              onClick={async () => {
                                // Filter rows by CAISSIER from metadata
                                const filtered: RowData[] = [];
                                for (const row of sortedData) {
                                  // Find Date-fin column
                                  const dateFinKey = Object.keys(row).find(k => k.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[-_ ]/g, '').toUpperCase() === 'DATEFIN');
                                  const isExpired = dateFinKey ? isDateExpired(row[dateFinKey]) : false;
                                  const statut = (row['Statut'] || '').toLowerCase();
                                  // Exclude expired or paid rows
                                  if (!isExpired && statut !== 'payé' && statut !== 'paid') {
                                    // CAISSIER filtering: fetchDocumentMetadata if needed, or use cached value
                                    let caissierValue = '';
                                    if (row.paymentDocId || row.id) {
                                      const meta = await fetchDocumentMetadata(row.paymentDocId || row.id);
                                      for (const m of meta) {
                                        if ((m.metadata_type?.label || m.metadata_type?.name || '').toUpperCase() === 'CAISSIER' && m.value) {
                                          caissierValue = m.value.trim();
                                          break;
                                        }
                                      }
                                    }
                                    if (caissierValue === caissier) {
                                      filtered.push(row);
                                    }
                                  }
                                }
                                exportTableToPDF(labels, filtered, `OP-${caissier}.pdf`);
                              }}
                            >{caissier}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  {/* Exporter Liste-Emergement with sub-options by CAISSIER */}
                  <div>
                    <div
                      className="flex items-center justify-between px-3 py-2 text-xs font-semibold cursor-pointer hover:bg-gray-100"
                      onClick={() => setExpandedExportEmergement((v) => !v)}
                      style={{ userSelect: 'none' }}
                    >
                      <span>Exporter Liste-Emergement</span>
                      <span>{expandedExportEmergement ? '▼' : '▶'}</span>
                    </div>
                    {expandedExportEmergement && (
                      <div className="pl-2">
                        {caissierList.map(caissier => (
                          <button
                            key={caissier}
                            className="w-full px-3 py-2 text-left hover:bg-blue-50 text-xs"
                            type="button"
                            onClick={async () => {
                              // Filter rows by CAISSIER from metadata
                              const filtered: RowData[] = [];
                              for (const row of sortedData) {
                                const docId = row.paymentDocId || row.id;
                                const meta = await fetchDocumentMetadata(docId);
                                const found = meta.find(m => (m.metadata_type?.label || m.metadata_type?.name || '').toUpperCase() === 'CAISSIER' && m.value && m.value.trim() === caissier);
                                if (found) filtered.push(row);
                              }
                              if (filtered.length === 0) {
                                alert(`Aucune donnée trouvée pour CAISSIER: ${caissier}`);
                                return;
                              }
                              exportTableToPDFEmergement(visibleColumns, filtered);
                              setShowExportMenu(false);
                              setExpandedExportEmergement(false);
                            }}
                          >{caissier}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="relative group">
              <button
                className="px-2 py-1 rounded bg-gray-200 text-gray-700 text-xs"
                onClick={() => setShowColumnMenu((v) => !v)}
                type="button"
              >
                Colonnes
              </button>
              {showColumnMenu && (
                <div className="absolute z-10 left-0 mt-1 w-36 bg-white border rounded shadow-lg"
                  onMouseLeave={() => setShowColumnMenu(false)}
                  onMouseEnter={() => setShowColumnMenu(true)}
                >
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
              )}
            </div>
            <Input
              name="search"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="max-w-xs h-8 ml-2"
            />
          </div>
          <div className="flex flex-col items-center justify-center w-full">
            <Card className="w-full flex-1 bg-white/90 backdrop-blur-md shadow-lg p-0 py-0 gap-0 mt-0">
              {loading ? (
                <div className="flex items-center justify-center h-64 text-center py-4 text-gray-500">Chargement...</div>
              ) : (
                <>
                  <div className="overflow-x-auto overflow-y-auto h-[calc(112vh-280px)]">
                    <table className="min-w-full h-full divide-y divide-gray-200">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          <th className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            <input
                              type="checkbox"
                              checked={paginatedData.length > 0 && paginatedData.every((_, i) => selectedRows.has(i))}
                              onChange={handleSelectAll}
                              title="Tout sélectionner"
                              className="scale-75"
                            />
                          </th>
                          {visibleColumns.map((label) => {
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
                            <tr key={i} className={`text-xs hover:bg-blue-50 transition-colors leading-tight ${selectedRows.has(i) ? 'bg-blue-100' : (i % 2 === 0 ? 'bg-gray-50' : 'bg-white')} ${expired ? 'opacity-60 pointer-events-none' : ''}`}> 
                              <td className="px-2 py-0.5 text-center align-middle">
                                <input
                                  type="checkbox"
                                  checked={selectedRows.has(i)}
                                  onChange={() => handleSelectRow(i)}
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
                                    className="px-2 py-0.5 rounded bg-blue-600 text-white text-xs font-semibold w-16 hover:bg-blue-700 transition-colors"
                                    title="Modifier les métadonnées"
                                    onClick={async () => {
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
                                    className="px-2 py-0.5 rounded bg-green-600 text-white text-xs font-semibold w-16 hover:bg-green-700 transition-colors"
                                    onClick={() => {
                                      setPrefillData(row);
                                      setShowPaymentSheet(true);
                                    }}
                                  >
                                    Payer
                                  </button>
                                ))}
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
                                                const updates = editMetadata.filter((meta) => meta.editable && editValues[meta.id] !== undefined && editValues[meta.id] !== meta.value);
                                                for (const meta of updates) {
                                                  await api.put(`/mayan/documents/${docId}/metadata/${meta.id}`, { value: editValues[meta.id] });
                                                }
                                                setShowEditDrawer(false);
                                                setEditMetadata(null);
                                                setEditRow(null);
                                                setEditValues({});
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
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
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
      </div>
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
      <Sheet open={showPaymentSheet} onOpenChange={setShowPaymentSheet}>
        <SheetContent side="right">
          <div className="p-2">
            <h2 className="text-lg font-semibold mb-4">Effectuer un paiement</h2>
            <PaymentVoucherForm
              prefill={prefillData || undefined}
              documentId={prefillData?.id}
              onSuccess={handleVoucherSuccess}
            />
          </div>
        </SheetContent>
      </Sheet>
      <footer className="w-full text-center py-2 text-gray-700 bg-white/80 mt-4">
        Ministère du Budget &copy; 2025
      </footer>
      {/* Fermeture de compte Modal */}
    {showCloseAccountModal && (
      <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
        <div className="bg-white rounded-lg shadow-lg p-6 text-center w-full max-w-md">
          <h2 className="text-xl font-bold mb-3 text-orange-600">Fermeture de compte du mois</h2>
          <p className="mb-4 text-sm">Veuillez téléverser la liste d'émergenement de clôture du compte pour ce mois.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setCloseAccountLoading(true);
              setCloseAccountError("");
              setCloseAccountSuccess(false);
              const file = fileInputRef.current?.files?.[0];
              if (!file) {
                setCloseAccountError("Veuillez sélectionner un fichier.");
                setCloseAccountLoading(false);
                return;
              }
              const formData = new FormData();
              formData.append("file", file);
              try {
                setCloseAccountSuccess(true);
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              } catch (err: unknown) {
                setCloseAccountError("Erreur lors de l'envoi du fichier.");
              } finally {
                setCloseAccountLoading(false);
              }
            }}
            className="space-y-4"
          >
            <input
              type="file"
              ref={fileInputRef}
              className="w-full border rounded px-2 py-1 text-xs"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.zip,.rar,.7z,.txt"
              required
              placeholder="Sélectionnez un fichier à téléverser"
              title="Sélectionnez un fichier à téléverser"
            />
            {closeAccountError && <div className="text-red-600 text-xs mb-2">{closeAccountError}</div>}
            {closeAccountSuccess && <div className="text-green-600 text-xs mb-2">Fichier envoyé avec succès !</div>}
            <div className="flex gap-2 justify-center">
              <button
                type="submit"
                className="bg-orange-600 text-white px-4 py-2 rounded text-sm hover:bg-orange-700 transition-colors disabled:opacity-50"
                disabled={closeAccountLoading}
              >
                {closeAccountLoading ? "Envoi..." : "Envoyer"}
              </button>
              <button
                type="button"
                className="bg-gray-300 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-400 transition-colors"
                onClick={() => {
                  setShowCloseAccountModal(false);
                  setCloseAccountError("");
                  setCloseAccountSuccess(false);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
  </>
)};