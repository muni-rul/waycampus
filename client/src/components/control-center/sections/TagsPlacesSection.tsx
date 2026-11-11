import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Edit2,
  ExternalLink,
  Shield,
  Layers,
  X,
  History,
  Sparkles
} from 'lucide-react';
import { ApiService } from '../../../services/api';
import { getAllCombinedPlaceTags, CampusTagPlaceItem, getPanoramaThumbnail } from '../data/campusEntities';
import { getAllCustomPlaceTags, setCustomPlaceTags, CAMPUS_GRAPH_MAP } from '../../../data/campusGraph';
import { rebuildCampusSearchIndex } from '../../../services/campusSearchService';
import { CustomPlaceTag } from '../../../../../shared/types';

type PlaceItem = CampusTagPlaceItem;

export const TagsPlacesSection: React.FC = () => {
  const [places, setPlaces] = useState<PlaceItem[]>(() => getAllCombinedPlaceTags());
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPlace, setEditingPlace] = useState<Partial<PlaceItem> | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Categories
  const categories = [
    'ALL',
    'CLASSROOM',
    'LABORATORY',
    'FACULTY_CABIN',
    'DEPARTMENT_OFFICE',
    'RESTROOM',
    'SEMINAR_HALL',
    'LIBRARY',
    'CANTEEN',
    'LANDMARK',
    'AMENITY',
    'FACILITY',
    'GATE_ENTRANCE'
  ];

  const fetchPlaces = async () => {
    try {
      const data = await ApiService.getPlaces();
      if (Array.isArray(data) && data.length > 0) {
        const defaults = getAllCombinedPlaceTags();
        const remoteIds = new Set(data.map((d: any) => d.id));
        const combined = [...data, ...defaults.filter((p) => !remoteIds.has(p.id))];
        setPlaces(combined);
      }
    } catch (err) {
      console.warn('Using full combined campus places & tags registry:', err);
    }
  };

  useEffect(() => {
    fetchPlaces();
  }, []);

  const filteredPlaces = places.filter((p) => {
    const matchesSearch =
      !searchQuery ||
      p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.roomNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.buildingName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.nodeId?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCat = categoryFilter === 'ALL' || p.category === categoryFilter;
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'VERIFIED' && p.isVerified) ||
      (statusFilter === 'UNVERIFIED' && !p.isVerified);

    return matchesSearch && matchesCat && matchesStatus;
  });

  const handleSavePlace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlace?.name) return;

    const targetNode = editingPlace.nodeId?.trim();
    if (!targetNode || !CAMPUS_GRAPH_MAP.has(targetNode)) {
      setActionMessage('Error: Please select a valid reachable campus panorama node for this tag/place.');
      setTimeout(() => setActionMessage(null), 5000);
      return;
    }

    const updatedItem: PlaceItem = {
      id: editingPlace.id || `tag_${Date.now()}`,
      name: editingPlace.name.trim(),
      category: editingPlace.category || 'LANDMARK',
      buildingId: editingPlace.buildingId || 'bld_ab',
      buildingName: editingPlace.buildingName || 'Administrative Block',
      floorNumber: editingPlace.floorNumber ?? 0,
      floorName: editingPlace.floorName || `Floor ${editingPlace.floorNumber ?? 0}`,
      roomNumber: editingPlace.roomNumber || '',
      nodeId: targetNode,
      imagePath: editingPlace.imagePath || getPanoramaThumbnail(targetNode),
      description: editingPlace.description || '',
      isVerified: editingPlace.isVerified ?? true,
      yaw: editingPlace.yaw ?? 0
    };

    // Clean up old tag instances across all nodes before inserting into targetNode
    const currentTagsMap = { ...getAllCustomPlaceTags() };
    for (const nid of Object.keys(currentTagsMap)) {
      currentTagsMap[nid] = (currentTagsMap[nid] || []).filter((t) => t.id !== updatedItem.id && t.id !== `tag_${updatedItem.id}`);
    }

    const nodeTags: CustomPlaceTag[] = [...(currentTagsMap[targetNode] || [])];
    const new3DTag: CustomPlaceTag = {
      id: updatedItem.id,
      text: updatedItem.name,
      yaw: updatedItem.yaw ?? 0,
      pitch: 0,
      distance: 180,
      color: updatedItem.category === 'CLASSROOM' ? '#3b82f6' : updatedItem.category === 'OFFICE' ? '#f59e0b' : '#10b981',
      category: (updatedItem.category as any) || 'LANDMARK',
      visibleFromDistance: true,
    };
    nodeTags.push(new3DTag);
    currentTagsMap[targetNode] = nodeTags;
    setCustomPlaceTags(currentTagsMap);

    try {
      if (editingPlace.id) {
        await ApiService.updatePlace(editingPlace.id, updatedItem);
        setPlaces((prev) => prev.map((p) => (p.id === editingPlace.id ? updatedItem : p)));
        setActionMessage(`Updated place tag: "${updatedItem.name}"`);
      } else {
        await ApiService.addPlace(updatedItem);
        setPlaces((prev) => [updatedItem, ...prev]);
        setActionMessage(`Created new place tag: "${updatedItem.name}"`);
      }

      // Persist 3D tags in graph overrides
      const overrides = await ApiService.getGraphOverrides().catch(() => ({}));
      await ApiService.saveGraphOverrides(
        { ...overrides, customPlaceTags: currentTagsMap },
        'Admin (Tags & Places)'
      );

      rebuildCampusSearchIndex();

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('campnav:tags_updated'));
        window.dispatchEvent(new CustomEvent('campnav_data_sync'));
      }
    } catch (err) {
      console.warn('Persisted locally to active control session:', err);
      if (editingPlace.id) {
        setPlaces((prev) => prev.map((p) => (p.id === editingPlace.id ? updatedItem : p)));
        setActionMessage(`Updated: "${updatedItem.name}"`);
      } else {
        setPlaces((prev) => [updatedItem, ...prev]);
        setActionMessage(`Created: "${updatedItem.name}"`);
      }
      rebuildCampusSearchIndex();
    } finally {
      setIsEditModalOpen(false);
      setEditingPlace(null);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleDeletePlace = async (id: string, name: string) => {
    // Remove from 3D floating tags
    const currentTagsMap = { ...getAllCustomPlaceTags() };
    let changed = false;
    for (const [nid, tags] of Object.entries(currentTagsMap)) {
      const filtered = tags.filter((t) => t.id !== id && t.id !== `tag_${id}`);
      if (filtered.length !== tags.length) {
        currentTagsMap[nid] = filtered;
        changed = true;
      }
    }
    if (changed) {
      setCustomPlaceTags(currentTagsMap);
      ApiService.getGraphOverrides()
        .then((overrides) =>
          ApiService.saveGraphOverrides(
            { ...overrides, customPlaceTags: currentTagsMap },
            'Admin (Tags & Places Delete)'
          )
        )
        .catch(() => {});
    }

    try {
      await ApiService.deletePlace(id);
      setPlaces((prev) => prev.filter((p) => p.id !== id));
      setActionMessage(`Place tag "${name}" removed.`);
    } catch (err) {
      console.warn('Deleted from local active state:', err);
      setPlaces((prev) => prev.filter((p) => p.id !== id));
      setActionMessage(`Place tag "${name}" removed.`);
    } finally {
      rebuildCampusSearchIndex();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('campnav:tags_updated'));
        window.dispatchEvent(new CustomEvent('campnav_data_sync'));
      }
      setDeleteConfirmId(null);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 text-slate-800 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 sm:p-6 bg-white border border-slate-200/80 rounded-3xl shadow-xs">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold text-blue-600 mb-1">
            <MapPin className="w-4 h-4" />
            <span>CAMPUS PLACE REGISTRY</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#0f2744]">
            Tags & Campus Places Management
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage search tags, classroom checkpoints, faculty cabins, and facility POIs linked to panorama nodes.
          </p>
        </div>

        <button
          onClick={() => {
            setEditingPlace({
              name: '',
              category: 'CLASSROOM',
              buildingName: '',
              roomNumber: '',
              nodeId: '',
              isVerified: true
            });
            setIsEditModalOpen(true);
          }}
          className="px-4 py-2 bg-[#1a56db] hover:bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center space-x-2 shadow-xs transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Place Tag</span>
        </button>
      </div>

      {actionMessage && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-800 flex items-center space-x-2 font-medium">
          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Filters & Search */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="relative md:col-span-2">
          <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search tags by name, room number, building, or node..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white"
          />
        </div>

        <div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="VERIFIED">Verified Only</option>
            <option value="UNVERIFIED">Unverified Only</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-xs">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500 font-bold bg-slate-50">
          <span>Showing {filteredPlaces.length} campus places & tags</span>
          <span className="text-[11px] font-mono text-slate-400">Total count: {places.length}</span>
        </div>

        {isLoading ? (
          <div className="py-20 text-center text-slate-400 text-xs">Loading campus places...</div>
        ) : filteredPlaces.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            No places match your search query or filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 sticky top-0 z-10 text-[11px] text-slate-600 uppercase tracking-wider font-bold border-b border-slate-200">
                <tr>
                  <th className="px-3 py-3 w-14">Photo</th>
                  <th className="px-4 py-3">Place Name</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Building & Floor</th>
                  <th className="px-4 py-3">Room / Code</th>
                  <th className="px-4 py-3">Pano Node & Yaw</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPlaces.map((place) => (
                  <tr key={place.id} className="hover:bg-blue-50/40 transition">
                    <td className="px-3 py-2.5">
                      <img
                        src={place.imagePath || getPanoramaThumbnail(place.nodeId)}
                        alt={place.name}
                        loading="lazy"
                        className="w-11 h-8 rounded-lg object-cover border border-slate-200 bg-slate-100 shrink-0 shadow-2xs"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/assets/panoramas/06_AB/ab_044.jpg';
                        }}
                      />
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900">
                      <div className="flex items-center space-x-2">
                        <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>{place.name}</span>
                      </div>
                      {place.description && (
                        <div className="text-[11px] text-slate-400 font-normal truncate max-w-xs mt-0.5">
                          {place.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 border border-blue-200 text-blue-700">
                        {place.category || 'LANDMARK'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{place.buildingName || 'Campus Ground'}</div>
                      {place.floorNumber !== undefined && (
                        <div className="text-[10px] text-slate-400">Floor {place.floorNumber}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-blue-700">
                      {place.roomNumber || '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-500">
                      {place.nodeId ? (
                        <div className="flex items-center space-x-1.5">
                          <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[11px] text-blue-700 font-bold border border-slate-200">
                            #{place.nodeId}
                          </span>
                          {place.yaw !== undefined && (
                            <span className="text-[10px] text-slate-400">{place.yaw}°</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-amber-700 text-[10px] font-bold">Unlinked</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {place.isVerified ? (
                        <span className="inline-flex items-center space-x-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Verified</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-bold">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Draft</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => {
                            setEditingPlace(place);
                            setIsEditModalOpen(true);
                          }}
                          className="p-1.5 hover:bg-blue-50 rounded-lg text-slate-400 hover:text-blue-600 transition cursor-pointer"
                          title="Edit place tag"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(place.id)}
                          className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 transition cursor-pointer"
                          title="Delete place"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit / Add Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 text-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-[#0f2744] text-sm flex items-center space-x-2">
                <MapPin className="w-4 h-4 text-blue-600" />
                <span>{editingPlace?.id ? 'Edit Campus Place' : 'Create New Campus Place'}</span>
              </h3>
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingPlace(null);
                }}
                className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePlace} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 mb-1 font-bold">Place Name *</label>
                <input
                  type="text"
                  required
                  value={editingPlace?.name || ''}
                  onChange={(e) => setEditingPlace({ ...editingPlace, name: e.target.value })}
                  placeholder="e.g. Physics Department Lab, Room 204"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1 font-bold">Category</label>
                  <select
                    value={editingPlace?.category || 'CLASSROOM'}
                    onChange={(e) => setEditingPlace({ ...editingPlace, category: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500"
                  >
                    {categories.filter((c) => c !== 'ALL').map((c) => (
                      <option key={c} value={c}>
                        {c.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 mb-1 font-bold">Room Number</label>
                  <input
                    type="text"
                    value={editingPlace?.roomNumber || ''}
                    onChange={(e) => setEditingPlace({ ...editingPlace, roomNumber: e.target.value })}
                    placeholder="e.g. 104, 202"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1 font-bold">Building Name</label>
                  <input
                    type="text"
                    value={editingPlace?.buildingName || ''}
                    onChange={(e) => setEditingPlace({ ...editingPlace, buildingName: e.target.value })}
                    placeholder="e.g. Main Block, LF Block"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 mb-1 font-bold">Panorama Node ID</label>
                  <input
                    type="text"
                    value={editingPlace?.nodeId || ''}
                    onChange={(e) => setEditingPlace({ ...editingPlace, nodeId: e.target.value })}
                    placeholder="e.g. 46, 199"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 mb-1 font-bold">Description</label>
                <textarea
                  rows={2}
                  value={editingPlace?.description || ''}
                  onChange={(e) => setEditingPlace({ ...editingPlace, description: e.target.value })}
                  placeholder="Optional details, landmark notes or instructions..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white resize-none"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="isVerified"
                  checked={editingPlace?.isVerified ?? true}
                  onChange={(e) => setEditingPlace({ ...editingPlace, isVerified: e.target.checked })}
                  className="rounded border-slate-300 text-blue-600 focus:ring-0"
                />
                <label htmlFor="isVerified" className="text-slate-700 font-medium">
                  Mark as officially verified on campus map
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingPlace(null);
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#1a56db] hover:bg-blue-600 text-white rounded-xl font-bold shadow-xs transition cursor-pointer"
                >
                  Save Place
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-rose-200 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-slate-800">
            <div className="flex items-center space-x-2 text-rose-600 font-black text-sm">
              <AlertTriangle className="w-5 h-5" />
              <span>Confirm Place Deletion</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to remove this place? This will archive the record and unbind it from student search results.
            </p>
            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const p = places.find((x) => x.id === deleteConfirmId);
                  handleDeletePlace(deleteConfirmId, p?.name || 'Place');
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
              >
                Delete Place
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
