'use client';

/**
 * Conditional Visibility Settings Component
 *
 * Settings panel for conditional visibility based on field values and page collections.
 * - Collection fields: Show operators based on field type (text, number, date, etc.)
 * - Page collections: Show operators for item count, has items, has no items
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import SettingsPanel from './SettingsPanel';
import type {
  Layer,
  CollectionField,
  CollectionFieldType,
  VisibilityCondition,
  VisibilityConditionGroup,
  ConditionalVisibility,
  VisibilityOperator
} from '@/types';
import { Button } from '@/components/ui/button';
import Icon from '@/components/ui/icon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Spinner } from '@/components/ui/spinner';
import {
  getFieldIcon,
  getOperatorsForFieldType,
  operatorRequiresValue,
  operatorRequiresItemSelection,
  operatorRequiresSecondValue,
  findDisplayField,
  getItemDisplayName,
  flattenFieldGroups,
  COMPARE_OPERATORS,
  PAGE_COLLECTION_OPERATORS,
  isDateFieldType,
} from '@/lib/collection-field-utils';
import { findAllCollectionLayers, CollectionLayerInfo } from '@/lib/layer-utils';
import { usePagesStore } from '@/stores/usePagesStore';
import { useEditorStore } from '@/stores/useEditorStore';
import { useComponentsStore } from '@/stores/useComponentsStore';
import { useCollectionsStore } from '@/stores/useCollectionsStore';
import { useLocalisationStore } from '@/stores/useLocalisationStore';
import { collectionsApi } from '@/lib/api';
import type { CollectionItemWithValues } from '@/types';

type PageFieldKey = 'locale' | 'name' | 'folder_name' | 'title_tag' | 'meta_description';

const PAGE_FIELDS: { key: PageFieldKey; label: string; icon: string }[] = [
  { key: 'locale', label: 'Locale', icon: 'globe' },
  { key: 'name', label: 'Page name', icon: 'file' },
  { key: 'folder_name', label: 'Folder name', icon: 'folder' },
  { key: 'title_tag', label: 'Title tag', icon: 'type' },
  { key: 'meta_description', label: 'Meta description', icon: 'align-left' },
];

const CURRENT_PAGE_OPERATORS: { value: import('@/types').VisibilityOperator; label: string }[] = [
  { value: 'is', label: 'Is' },
  { value: 'is_not', label: 'Is not' },
  { value: 'is_present', label: 'Is set' },
  { value: 'is_empty', label: 'Is not set' },
  { value: 'contains', label: 'Contains' },
  { value: 'does_not_contain', label: 'Does not contain' },
];

const CURRENT_PAGE_OPERATORS_NO_VALUE: import('@/types').VisibilityOperator[] = ['is_present', 'is_empty'];

const RUNTIME_VAR_OPERATORS: { value: VisibilityOperator; label: string }[] = [
  { value: 'is_present', label: 'Is set' },
  { value: 'is_empty', label: 'Is not set' },
  { value: 'is', label: 'Equals' },
  { value: 'is_not', label: 'Does not equal' },
  { value: 'contains', label: 'Contains' },
  { value: 'does_not_contain', label: 'Does not contain' },
  { value: 'lt', label: 'Less than' },
  { value: 'lte', label: 'Less than or equal' },
  { value: 'gt', label: 'Greater than' },
  { value: 'gte', label: 'Greater than or equal' },
  { value: 'is_before', label: 'Is before (date)' },
  { value: 'is_after', label: 'Is after (date)' },
];

const RUNTIME_VAR_OPERATORS_NO_VALUE: VisibilityOperator[] = ['is_present', 'is_empty'];

interface ConditionalVisibilitySettingsProps {
  layer: Layer | null;
  onLayerUpdate: (layerId: string, updates: Partial<Layer>) => void;
  /** Field groups with labels and sources for conditional visibility */
  fieldGroups?: { fields: CollectionField[]; label?: string; source?: 'page' | 'collection' }[];
}

/**
 * Reference Items Selector Component
 * Multi-select dropdown for selecting collection items for is_one_of/is_not_one_of operators
 */
function ReferenceItemsSelector({
  collectionId,
  value,
  onChange,
}: {
  collectionId: string;
  value: string; // JSON array of item IDs
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CollectionItemWithValues[]>([]);
  const [loading, setLoading] = useState(false);

  // Get the collection info and fields from the store
  const { collections, fields } = useCollectionsStore();
  const collection = collections.find(c => c.id === collectionId);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- collectionFields derived from store, useMemo deps intentional
  const collectionFields = fields[collectionId] || [];

  // Find the title/name field for display
  const displayField = useMemo(() => findDisplayField(collectionFields), [collectionFields]);

  // Parse selected IDs from JSON value
  const selectedIds = useMemo(() => {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [value]);

  // Get display name for an item
  const getDisplayName = useCallback(
    (item: CollectionItemWithValues) => getItemDisplayName(item, displayField),
    [displayField]
  );

  // Fetch items when dropdown opens
  useEffect(() => {
    if (open && collectionId) {
      const fetchItems = async () => {
        setLoading(true);
        try {
          const response = await collectionsApi.getItems(collectionId, { limit: 100 });
          if (!response.error) {
            setItems(response.data?.items || []);
          }
        } catch (err) {
          console.error('Failed to load items:', err);
        } finally {
          setLoading(false);
        }
      };
      fetchItems();
    }
  }, [open, collectionId]);

  // Toggle item selection
  const handleToggle = (itemId: string) => {
    const newSelectedIds = selectedIds.includes(itemId)
      ? selectedIds.filter(id => id !== itemId)
      : [...selectedIds, itemId];
    onChange(JSON.stringify(newSelectedIds));
  };

  // Get display text for closed state
  const getDisplayText = () => {
    if (selectedIds.length === 0) return 'Select items...';

    // Find display names for selected items
    const selectedNames = selectedIds
      .map(id => {
        const item = items.find(i => i.id === id);
        return item ? getDisplayName(item) : null;
      })
      .filter(Boolean);

    if (selectedNames.length > 0) {
      return selectedNames.length <= 2
        ? selectedNames.join(', ')
        : `${selectedNames.length} items selected`;
    }

    return `${selectedIds.length} item${selectedIds.length !== 1 ? 's' : ''} selected`;
  };

  if (!collectionId) {
    return <div className="text-xs text-muted-foreground">No collection linked</div>;
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="input"
          size="sm"
          className="w-full justify-between font-normal"
        >
          <span className="truncate text-xs">{getDisplayText()}</span>
          <Icon name="chevronDown" className="size-2.5 opacity-50 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-50 max-h-60 overflow-y-auto" align="start">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-4 text-xs text-muted-foreground">
            No items in this collection
          </div>
        ) : (
          items.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            return (
              <DropdownMenuCheckboxItem
                key={item.id}
                checked={isSelected}
                onCheckedChange={() => handleToggle(item.id)}
                onSelect={(e) => e.preventDefault()}
              >
                {getDisplayName(item)}
              </DropdownMenuCheckboxItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function ConditionalVisibilitySettings({
  layer,
  onLayerUpdate,
  fieldGroups,
}: ConditionalVisibilitySettingsProps) {
  // Derive flat list of fields from fieldGroups
  const allFieldsFromGroups = useMemo(() => flattenFieldGroups(fieldGroups), [fieldGroups]);

  // Get current page layers for page collections
  const draftsByPageId = usePagesStore((state) => state.draftsByPageId);
  const currentPageId = useEditorStore((state) => state.currentPageId);
  const editingComponentId = useEditorStore((state) => state.editingComponentId);
  const activeBreakpoint = useEditorStore((state) => state.activeBreakpoint);

  const componentDrafts = useComponentsStore((state) => state.componentDrafts);
  const availableLocales = useLocalisationStore((state) => state.locales);

  // Get all collection layers on the page
  const pageCollectionLayers = useMemo((): CollectionLayerInfo[] => {
    if (!currentPageId) return [];

    let layers: Layer[] = [];
    if (editingComponentId) {
      layers = componentDrafts[editingComponentId] || [];
    } else {
      const draft = draftsByPageId[currentPageId];
      layers = draft ? draft.layers : [];
    }

    return findAllCollectionLayers(layers);
  }, [currentPageId, editingComponentId, componentDrafts, draftsByPageId]);

  // Initialize groups and default visibility from layer data
  const groups: VisibilityConditionGroup[] = useMemo(() => {
    return layer?.variables?.conditionalVisibility?.groups || [];
  }, [layer?.variables?.conditionalVisibility]);

  const defaultVisibility = layer?.variables?.conditionalVisibility?.defaultVisibility ?? 'visible';

  // Helper to update the full conditionalVisibility object
  const updateConditionalVisibility = useCallback((
    newGroups: VisibilityConditionGroup[],
    newDefault?: 'visible' | 'hidden'
  ) => {
    if (!layer) return;
    const base = newDefault ?? defaultVisibility;
    const hasContent = newGroups.length > 0 || base === 'hidden';
    onLayerUpdate(layer.id, {
      variables: {
        ...layer.variables,
        conditionalVisibility: hasContent
          ? { defaultVisibility: base, groups: newGroups }
          : undefined,
      },
    });
  }, [layer, onLayerUpdate, defaultVisibility]);

  const updateGroups = useCallback((newGroups: VisibilityConditionGroup[]) => {
    updateConditionalVisibility(newGroups);
  }, [updateConditionalVisibility]);

  const hasConditions = groups.length > 0;

  if (!layer) return null;

  // Handle adding a new condition group for a collection field
  const handleAddFieldConditionGroup = (field: CollectionField) => {
    const newCondition: VisibilityCondition = {
      id: `${Date.now()}-1`,
      source: 'collection_field',
      fieldId: field.id,
      fieldType: field.type,
      referenceCollectionId: field.reference_collection_id || undefined,
      operator: getOperatorsForFieldType(field.type)[0].value,
      value: (field.type === 'reference' || field.type === 'multi_reference') ? '[]' : field.type === 'boolean' ? 'true' : '',
    };

    const newGroup: VisibilityConditionGroup = {
      id: Date.now().toString(),
      conditions: [newCondition],
    };

    updateGroups([...groups, newGroup]);
  };

  // Handle adding a new condition group for a runtime variable
  const handleAddRuntimeVarConditionGroup = () => {
    const newCondition: VisibilityCondition = {
      id: `${Date.now()}-1`,
      source: 'runtime_var',
      runtimeVarPath: '',
      operator: 'is_present',
    };
    const newGroup: VisibilityConditionGroup = {
      id: Date.now().toString(),
      conditions: [newCondition],
    };
    updateGroups([...groups, newGroup]);
  };

  // Handle adding a runtime var condition to an existing group (OR logic)
  const handleAddRuntimeVarConditionFromOr = (groupId: string) => {
    const newGroups = groups.map(group => {
      if (group.id === groupId) {
        const newCondition: VisibilityCondition = {
          id: `${groupId}-${Date.now()}`,
          source: 'runtime_var',
          runtimeVarPath: '',
          operator: 'is_present',
        };
        return { ...group, conditions: [...group.conditions, newCondition] };
      }
      return group;
    });
    updateGroups(newGroups);
  };

  // Handle runtime var path change
  const handleRuntimeVarPathChange = (groupId: string, conditionId: string, path: string) => {
    const newGroups = groups.map(group => {
      if (group.id === groupId) {
        return {
          ...group,
          conditions: group.conditions.map(c =>
            c.id === conditionId ? { ...c, runtimeVarPath: path } : c
          ),
        };
      }
      return group;
    });
    updateGroups(newGroups);
  };

  // Handle adding a new condition group for a page collection
  const handleAddPageCollectionConditionGroup = (collectionLayer: CollectionLayerInfo) => {
    const newCondition: VisibilityCondition = {
      id: `${Date.now()}-1`,
      source: 'page_collection',
      collectionLayerId: collectionLayer.layerId,
      collectionLayerName: collectionLayer.layerName,
      operator: 'has_items',
    };

    const newGroup: VisibilityConditionGroup = {
      id: Date.now().toString(),
      conditions: [newCondition],
    };

    updateGroups([...groups, newGroup]);
  };

  // Handle removing a condition group
  const handleRemoveConditionGroup = (groupId: string) => {
    updateGroups(groups.filter(g => g.id !== groupId));
  };

  // Handle adding a condition to an existing group (OR logic)
  const handleAddConditionFromOr = (groupId: string, field: CollectionField) => {
    const newGroups = groups.map(group => {
      if (group.id === groupId) {
        const newCondition: VisibilityCondition = {
          id: `${groupId}-${Date.now()}`,
          source: 'collection_field',
          fieldId: field.id,
          fieldType: field.type,
          referenceCollectionId: field.reference_collection_id || undefined,
          operator: getOperatorsForFieldType(field.type)[0].value,
          value: (field.type === 'reference' || field.type === 'multi_reference') ? '[]' : field.type === 'boolean' ? 'true' : '',
        };
        return {
          ...group,
          conditions: [...group.conditions, newCondition],
        };
      }
      return group;
    });
    updateGroups(newGroups);
  };

  // Handle adding a page collection condition to a group
  const handleAddPageCollectionConditionFromOr = (groupId: string, collectionLayer: CollectionLayerInfo) => {
    const newGroups = groups.map(group => {
      if (group.id === groupId) {
        const newCondition: VisibilityCondition = {
          id: `${groupId}-${Date.now()}`,
          source: 'page_collection',
          collectionLayerId: collectionLayer.layerId,
          collectionLayerName: collectionLayer.layerName,
          operator: 'has_items',
        };
        return {
          ...group,
          conditions: [...group.conditions, newCondition],
        };
      }
      return group;
    });
    updateGroups(newGroups);
  };

  // Handle adding a current_page field condition group
  const handleAddCurrentPageFieldConditionGroup = (pageField: PageFieldKey) => {
    const newCondition: VisibilityCondition = {
      id: `${Date.now()}-1`,
      source: 'current_page',
      pageField,
      operator: 'is',
      value: '',
    };
    const newGroup: VisibilityConditionGroup = {
      id: Date.now().toString(),
      conditions: [newCondition],
    };
    updateGroups([...groups, newGroup]);
  };

  // Handle adding a current_page field condition to an existing group (OR logic)
  const handleAddCurrentPageFieldConditionFromOr = (groupId: string, pageField: PageFieldKey) => {
    const newGroups = groups.map(group => {
      if (group.id === groupId) {
        const newCondition: VisibilityCondition = {
          id: `${groupId}-${Date.now()}`,
          source: 'current_page',
          pageField,
          operator: 'is',
          value: '',
        };
        return { ...group, conditions: [...group.conditions, newCondition] };
      }
      return group;
    });
    updateGroups(newGroups);
  };

  // Handle removing a condition
  const handleRemoveCondition = (groupId: string, conditionId: string) => {
    const newGroups = groups.map(group => {
      if (group.id === groupId) {
        const newConditions = group.conditions.filter(c => c.id !== conditionId);
        if (newConditions.length === 0) {
          return null;
        }
        return {
          ...group,
          conditions: newConditions,
        };
      }
      return group;
    }).filter((group): group is VisibilityConditionGroup => group !== null);
    updateGroups(newGroups);
  };

  // Handle operator change
  const handleOperatorChange = (groupId: string, conditionId: string, operator: VisibilityOperator) => {
    const newGroups = groups.map(group => {
      if (group.id === groupId) {
        return {
          ...group,
          conditions: group.conditions.map(c => {
            if (c.id === conditionId) {
              return {
                ...c,
                operator,
                value: operatorRequiresValue(operator) ? c.value : undefined,
                value2: operatorRequiresSecondValue(operator) ? c.value2 : undefined,
              };
            }
            return c;
          }),
        };
      }
      return group;
    });
    updateGroups(newGroups);
  };

  // Handle value change
  const handleValueChange = (groupId: string, conditionId: string, value: string) => {
    const newGroups = groups.map(group => {
      if (group.id === groupId) {
        return {
          ...group,
          conditions: group.conditions.map(c => {
            if (c.id === conditionId) {
              return { ...c, value };
            }
            return c;
          }),
        };
      }
      return group;
    });
    updateGroups(newGroups);
  };

  // Handle second value change (for date between)
  const handleValue2Change = (groupId: string, conditionId: string, value2: string) => {
    const newGroups = groups.map(group => {
      if (group.id === groupId) {
        return {
          ...group,
          conditions: group.conditions.map(c => {
            if (c.id === conditionId) {
              return { ...c, value2 };
            }
            return c;
          }),
        };
      }
      return group;
    });
    updateGroups(newGroups);
  };

  // Handle compare operator change (for page collection item count)
  const handleCompareOperatorChange = (groupId: string, conditionId: string, compareOperator: 'eq' | 'lt' | 'lte' | 'gt' | 'gte') => {
    const newGroups = groups.map(group => {
      if (group.id === groupId) {
        return {
          ...group,
          conditions: group.conditions.map(c => {
            if (c.id === conditionId) {
              return { ...c, compareOperator };
            }
            return c;
          }),
        };
      }
      return group;
    });
    updateGroups(newGroups);
  };

  // Handle compare value change (for page collection item count)
  const handleCompareValueChange = (groupId: string, conditionId: string, compareValue: number) => {
    const newGroups = groups.map(group => {
      if (group.id === groupId) {
        return {
          ...group,
          conditions: group.conditions.map(c => {
            if (c.id === conditionId) {
              return { ...c, compareValue };
            }
            return c;
          }),
        };
      }
      return group;
    });
    updateGroups(newGroups);
  };

  // Get field name by ID
  const getFieldName = (fieldId: string): string => {
    const field = allFieldsFromGroups.find(f => f.id === fieldId);
    return field?.name || 'Unknown field';
  };

  // Get field type by ID
  const getFieldType = (fieldId: string): CollectionFieldType | undefined => {
    const field = allFieldsFromGroups.find(f => f.id === fieldId);
    return field?.type;
  };

  // Render the dropdown content for adding conditions
  const renderAddConditionDropdown = (
    onFieldSelect: (field: CollectionField) => void,
    onPageCollectionSelect: (layer: CollectionLayerInfo) => void,
    onRuntimeVarSelect: () => void,
    onCurrentPageFieldSelect: (pageField: PageFieldKey) => void = handleAddCurrentPageFieldConditionGroup
  ) => (
    <DropdownMenuContent align="end" className="max-h-75! overflow-y-auto">
      {/* Collection Fields Section - render each group */}
      {fieldGroups?.map((group, groupIndex) => group.fields.length > 0 && (
        <React.Fragment key={groupIndex}>
          {groupIndex > 0 && <DropdownMenuSeparator />}
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {group.label || 'Collection Fields'}
          </DropdownMenuLabel>
          {group.fields.map((field) => (
            <DropdownMenuItem
              key={field.id}
              onClick={() => onFieldSelect(field)}
              className="flex items-center gap-2"
            >
              <Icon name={getFieldIcon(field.type)} className="size-3 opacity-60" />
              {field.name}
            </DropdownMenuItem>
          ))}
        </React.Fragment>
      ))}

      {/* Page Collections Section */}
      {pageCollectionLayers.length > 0 && (
        <>
          {allFieldsFromGroups.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Page Collections
          </DropdownMenuLabel>
          {pageCollectionLayers.map((collectionLayer) => (
            <DropdownMenuItem
              key={collectionLayer.layerId}
              onClick={() => onPageCollectionSelect(collectionLayer)}
              className="flex items-center gap-2"
            >
              <Icon name="database" className="size-3 opacity-60" />
              {collectionLayer.layerName}
            </DropdownMenuItem>
          ))}
        </>
      )}

      {/* Current Page Section */}
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs text-muted-foreground">Current Page</DropdownMenuLabel>
      {PAGE_FIELDS.map((pf) => (
        <DropdownMenuItem
          key={pf.key} onClick={() => onCurrentPageFieldSelect(pf.key)}
          className="flex items-center gap-2"
        >
          <Icon name={pf.icon as any} className="size-3 opacity-60" />
          {pf.label}
        </DropdownMenuItem>
      ))}

      {/* Runtime Variable Section */}
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs text-muted-foreground">App State</DropdownMenuLabel>
      <DropdownMenuItem onClick={onRuntimeVarSelect} className="flex items-center gap-2">
        <Icon name="zap" className="size-3 opacity-60" />
        Runtime variable
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  // Get reference collection ID from condition or look it up from field
  const getReferenceCollectionId = (condition: VisibilityCondition): string | undefined => {
    if (condition.referenceCollectionId) {
      return condition.referenceCollectionId;
    }
    // Fallback: look up from field
    if (condition.fieldId) {
      const field = allFieldsFromGroups.find(f => f.id === condition.fieldId);
      return field?.reference_collection_id || undefined;
    }
    return undefined;
  };

  // Render a single condition
  const renderCondition = (condition: VisibilityCondition, group: VisibilityConditionGroup, index: number) => {
    const isRuntimeVar = condition.source === 'runtime_var';
    const isPageCollection = condition.source === 'page_collection';
    const isCurrentPage = condition.source === 'current_page';
    const fieldType = (isPageCollection || isRuntimeVar || isCurrentPage) ? undefined : condition.fieldType || getFieldType(condition.fieldId || '');
    const operators = isRuntimeVar ? RUNTIME_VAR_OPERATORS : isPageCollection ? PAGE_COLLECTION_OPERATORS : isCurrentPage ? CURRENT_PAGE_OPERATORS : getOperatorsForFieldType(fieldType);
    const pageFieldDef = isCurrentPage ? PAGE_FIELDS.find(pf => pf.key === condition.pageField) : undefined;
    const icon = isRuntimeVar ? 'zap' : isPageCollection ? 'database' : isCurrentPage ? (pageFieldDef?.icon || 'file') : getFieldIcon(fieldType);
    const displayName = isRuntimeVar
      ? (condition.runtimeVarPath || 'Runtime variable')
      : isPageCollection
        ? condition.collectionLayerName || 'Collection'
        : isCurrentPage
          ? (pageFieldDef?.label || 'Page field')
          : getFieldName(condition.fieldId || '');
    const referenceCollectionId = getReferenceCollectionId(condition);

    return (
      <React.Fragment key={condition.id}>
        {index > 0 && (
          <li className="flex items-center gap-2 h-6">
            <Label variant="muted" className="text-[10px]">Or</Label>
            <hr className="flex-1" />
          </li>
        )}

        <li className="*:w-full flex flex-col gap-2">
          <header className="flex items-center gap-1.5">
            <div className="size-5 flex items-center justify-center rounded-[6px] bg-secondary/50 hover:bg-secondary">
              <Icon name={icon as any} className="size-2.5 opacity-60" />
            </div>
            <Label variant="muted" className="truncate">{displayName}</Label>

            <span
              role="button"
              tabIndex={0}
              className="ml-auto -my-1 -mr-0.5 shrink-0 p-0.5 rounded-sm opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
              onClick={() => handleRemoveCondition(group.id, condition.id)}
            >
              <Icon name="x" className="size-2.5" />
            </span>
          </header>

          {/* Operator Select */}
          <Select
            value={condition.operator}
            onValueChange={(value) => handleOperatorChange(group.id, condition.id, value as VisibilityOperator)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {operators.map((op) => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          {/* Runtime var: path input */}
          {isRuntimeVar && (
            <Input
              placeholder="forms.contact.email"
              value={condition.runtimeVarPath || ''}
              onChange={(e) => handleRuntimeVarPathChange(group.id, condition.id, e.target.value)}
            />
          )}

          {/* Runtime var: value input (hidden for set/not_set operators) */}
          {isRuntimeVar && !RUNTIME_VAR_OPERATORS_NO_VALUE.includes(condition.operator) && (
            <Input
              placeholder={condition.operator === 'is_before' || condition.operator === 'is_after' ? 'YYYY-MM-DD or "today"' : 'Value...'}
              value={condition.value || ''}
              onChange={(e) => handleValueChange(group.id, condition.id, e.target.value)}
            />
          )}

          {/* Current page: value input */}
          {isCurrentPage && !CURRENT_PAGE_OPERATORS_NO_VALUE.includes(condition.operator) && (
            condition.pageField === 'locale' ? (
              <Select
                value={condition.value || ''}
                onValueChange={(v) => handleValueChange(group.id, condition.id, v)}
              >
                <SelectTrigger><SelectValue placeholder="Select locale..." /></SelectTrigger>
                <SelectContent>
                  {availableLocales.map(locale => (
                    <SelectItem key={locale.id} value={locale.code}>{locale.label} ({locale.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                placeholder="Value..."
                value={condition.value || ''}
                onChange={(e) => handleValueChange(group.id, condition.id, e.target.value)}
              />
            )
          )}

          {/* Value Input(s) based on operator */}
          {condition.operator === 'item_count' && (
            <div className="flex gap-2">
              <Select
                value={condition.compareOperator || 'eq'}
                onValueChange={(value) => handleCompareOperatorChange(group.id, condition.id, value as any)}
              >
                <SelectTrigger className="w-1/2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {COMPARE_OPERATORS.map((op) => (
                      <SelectItem key={op.value} value={op.value}>
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="0"
                value={condition.compareValue ?? ''}
                onChange={(e) => handleCompareValueChange(group.id, condition.id, parseInt(e.target.value) || 0)}
                className="w-1/2"
              />
            </div>
          )}

          {/* Reference/Multi-reference items selector */}
          {operatorRequiresItemSelection(condition.operator) && referenceCollectionId && (
            <ReferenceItemsSelector
              collectionId={referenceCollectionId}
              value={condition.value || '[]'}
              onChange={(value) => handleValueChange(group.id, condition.id, value)}
            />
          )}

          {!isCurrentPage && !isRuntimeVar && operatorRequiresValue(condition.operator) && condition.operator !== 'item_count' && !operatorRequiresItemSelection(condition.operator) && (
            <>
              {fieldType === 'boolean' ? (
                <Select
                  value={condition.value || 'true'}
                  onValueChange={(value) => handleValueChange(group.id, condition.id, value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="true">True</SelectItem>
                      <SelectItem value="false">False</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ) : isDateFieldType(fieldType) ? (
                <Input
                  type="date"
                  value={condition.value || ''}
                  onChange={(e) => handleValueChange(group.id, condition.id, e.target.value)}
                />
              ) : fieldType === 'number' ? (
                <Input
                  type="number"
                  placeholder="Enter value..."
                  value={condition.value || ''}
                  onChange={(e) => handleValueChange(group.id, condition.id, e.target.value)}
                />
              ) : (
                <Input
                  placeholder="Enter value..."
                  value={condition.value || ''}
                  onChange={(e) => handleValueChange(group.id, condition.id, e.target.value)}
                />
              )}

              {/* Second value for date between */}
              {operatorRequiresSecondValue(condition.operator) && (
                <>
                  <Label variant="muted" className="text-[10px] text-center">and</Label>
                  <Input
                    type="date"
                    value={condition.value2 || ''}
                    onChange={(e) => handleValue2Change(group.id, condition.id, e.target.value)}
                  />
                </>
              )}
            </>
          )}
        </li>
      </React.Fragment>
    );
  };

  const handleGroupActionChange = (groupId: string, action: 'show' | 'hide') => {
    updateGroups(groups.map(g => g.id === groupId ? { ...g, action } : g));
  };

  const VisibilityToggle = ({
    value,
    onChange,
  }: {
    value: 'visible' | 'hidden' | 'show' | 'hide';
    onChange: (v: 'visible' | 'hidden' | 'show' | 'hide') => void;
  }) => {
    const isVisible = value === 'visible' || value === 'show';
    return (
      <div className="flex gap-1">
        <Button
          size="xs" variant={isVisible ? 'secondary' : 'ghost'}
          onClick={() => onChange(value === 'show' || value === 'hide' ? 'show' : 'visible')} className="gap-1"
        >
          <Icon name="eye" className="size-3" /> Visible
        </Button>
        <Button
          size="xs" variant={!isVisible ? 'secondary' : 'ghost'}
          onClick={() => onChange(value === 'show' || value === 'hide' ? 'hide' : 'hidden')} className="gap-1"
        >
          <Icon name="eye-off" className="size-3" /> Hidden
        </Button>
      </div>
    );
  };

  return (
    <SettingsPanel
      title="Conditional visibility"
      isOpen={true}
      onToggle={() => {}}
      action={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="xs"><Icon name="plus" /></Button>
          </DropdownMenuTrigger>
          {renderAddConditionDropdown(
            handleAddFieldConditionGroup,
            handleAddPageCollectionConditionGroup,
            handleAddRuntimeVarConditionGroup
          )}
        </DropdownMenu>
      }
    >
      <div className="flex flex-col gap-3">

        {/* No conditions: simple visible/hidden toggle (breakpoint-aware) */}
        {!hasConditions && (() => {
          // Per-breakpoint hidden class: desktop uses lg:hidden (min-width 1024px only)
          const hiddenClass = activeBreakpoint === 'desktop' ? 'lg:hidden'
            : activeBreakpoint === 'tablet' ? 'max-lg:hidden'
              : 'max-md:hidden';
          const layerClasses = Array.isArray(layer.classes)
            ? layer.classes
            : (layer.classes || '').split(' ').filter(Boolean);
          // Also detect legacy 'hidden' class as hidden at desktop
          const isHidden = layerClasses.includes(hiddenClass)
            || (activeBreakpoint === 'desktop' && layerClasses.includes('hidden'));

          const handleChange = (v: string) => {
            const toRemove = activeBreakpoint === 'desktop'
              ? ['hidden', 'lg:hidden']
              : [hiddenClass];
            const filtered = layerClasses.filter(c => !toRemove.includes(c));
            if (v === 'hidden') filtered.push(hiddenClass);
            onLayerUpdate(layer.id, { classes: filtered.join(' ') });
          };

          return (
            <div className="flex items-center justify-between gap-2">
              <Label variant="muted" className="text-[11px] shrink-0">Element is</Label>
              <VisibilityToggle
                value={isHidden ? 'hidden' : 'visible'}
                onChange={handleChange}
              />
            </div>
          );
        })()}

        {/* Conditions: IF / THEN / ELSE layout */}
        {groups.map((group, groupIndex) => (
          <React.Fragment key={group.id}>
            {groupIndex > 0 && (
              <div className="flex items-center gap-2 py-1">
                <hr className="flex-1" />
                <Label variant="muted" className="text-[10px]">And</Label>
                <hr className="flex-1" />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              {/* IF header: label + action toggle on same row */}
              <div className="flex items-center justify-between px-0.5">
                <Label variant="muted" className="text-[10px] uppercase tracking-wide shrink-0">If</Label>
                <VisibilityToggle
                  value={group.action ?? 'show'}
                  onChange={(v) => handleGroupActionChange(group.id, v as 'show' | 'hide')}
                />
              </div>

              <div className="flex flex-col bg-muted rounded-lg">
                <ul className="p-2 flex flex-col gap-2">
                  {group.conditions.map((condition, index) =>
                    renderCondition(condition, group, index)
                  )}

                  {/* OR row */}
                  <li className="flex items-center gap-2 h-6">
                    <Label variant="muted" className="text-[10px]">Or</Label>
                    <hr className="flex-1" />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost" size="xs"
                          className="size-5"
                        >
                          <div><Icon name="plus" className="size-2.5!" /></div>
                        </Button>
                      </DropdownMenuTrigger>
                      {renderAddConditionDropdown(
                        (field) => handleAddConditionFromOr(group.id, field),
                        (layer) => handleAddPageCollectionConditionFromOr(group.id, layer),
                        () => handleAddRuntimeVarConditionFromOr(group.id),
                        (pageField) => handleAddCurrentPageFieldConditionFromOr(group.id, pageField)
                      )}
                    </DropdownMenu>
                  </li>
                </ul>
              </div>

              {/* ELSE (shown only on the last group) */}
              {groupIndex === groups.length - 1 && (
                <div className="flex items-center justify-between gap-2 pl-0.5">
                  <Label variant="muted" className="text-[10px] uppercase tracking-wide shrink-0">Else</Label>
                  <VisibilityToggle
                    value={defaultVisibility}
                    onChange={(v) => updateConditionalVisibility(groups, v as 'visible' | 'hidden')}
                  />
                </div>
              )}
            </div>
          </React.Fragment>
        ))}
      </div>
    </SettingsPanel>
  );
}
