import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Modal,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Reanimated, {
  FadeInDown,
  ZoomIn,
} from 'react-native-reanimated';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { Swipeable } from 'react-native-gesture-handler';
import {
  ArrowLeftIcon,
  ArchiveBoxIcon,
  CheckCircleIcon,
  PlusIcon,
  TrashIcon,
} from 'react-native-heroicons/outline';
import { CheckCircleIcon as CheckCircleIconSolid } from 'react-native-heroicons/solid';

// ─────────────────────────────────────────────────────────────────────────────
// ToDoItem — self-contained list row.
// Entering animation only; collapse/delete is handled by LayoutAnimation
// on the parent so Reanimated never snapshots the open Swipeable.
// ─────────────────────────────────────────────────────────────────────────────
const ToDoItem = ({ item, onToggle, onDelete, showCategory }) => {
  const swipeRef = useRef(null);

  const handlePressDelete = () => {
    // Close the swipeable so it snaps shut, then immediately tell the parent.
    // LayoutAnimation (configured in the parent's handleDelete) handles the
    // smooth collapse of the list — no Reanimated exit snapshot involved.
    swipeRef.current?.close();
    onDelete(item.id);
  };

  return (
    // entering={FadeInDown} gives the nice pop-in when a new task is added.
    // NO exiting or layout props — those are what caused the ghost shadow.
    <Reanimated.View entering={FadeInDown.duration(200)}>
      <Swipeable
        ref={swipeRef}
        renderRightActions={() => (
          <TouchableOpacity
            style={styles.swipeDeleteAction}
            onPress={handlePressDelete}
            activeOpacity={0.8}
          >
            <TrashIcon size={24} color="#fff" />
            <Text style={styles.swipeDeleteText}>Delete</Text>
          </TouchableOpacity>
        )}
        rightThreshold={40}
        overshootRight={false}
      >
        <View style={styles.taskCard}>
          {/* Checkbox */}
          <TouchableOpacity
            onPress={() => onToggle(item.id)}
            style={styles.checkBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {item.isCompleted ? (
              <CheckCircleIconSolid size={26} color="#10b981" />
            ) : (
              <CheckCircleIcon size={26} color="#d1d5db" />
            )}
          </TouchableOpacity>

          {/* Task text + optional category badge */}
          <View style={styles.taskTextContainer}>
            <Text
              style={[
                styles.taskText,
                item.isCompleted && styles.taskTextCompleted,
              ]}
              numberOfLines={3}
            >
              {item.text}
            </Text>
            {showCategory && (
              <Text style={styles.taskCategoryBadge}>{item.category}</Text>
            )}
          </View>
        </View>
      </Swipeable>
    </Reanimated.View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ToDoScreen
// ─────────────────────────────────────────────────────────────────────────────
const STORAGE_KEY = '@todo_list';
const CATEGORIES_KEY = '@todo_categories';
const DEFAULT_CATEGORIES = ['All', 'Personal'];

const ToDoScreen = ({ navigation }) => {
  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [activeCategory, setActiveCategory] = useState('All');
  const [inputText, setInputText] = useState('');
  const [newCategoryText, setNewCategoryText] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState(null);

  // ── Load persisted data on mount ────────────────────────────────────────────
  useEffect(() => {
    const loadData = async () => {
      try {
        const [savedTasks, savedCategories] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(CATEGORIES_KEY),
        ]);

        if (savedTasks) {
          const parsed = JSON.parse(savedTasks);
          if (Array.isArray(parsed)) setTasks(parsed);
        }

        if (savedCategories) {
          const parsed = JSON.parse(savedCategories);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCategories(parsed);
          } else {
            await AsyncStorage.setItem(
              CATEGORIES_KEY,
              JSON.stringify(DEFAULT_CATEGORIES),
            );
          }
        } else {
          // First launch — persist defaults
          await AsyncStorage.setItem(
            CATEGORIES_KEY,
            JSON.stringify(DEFAULT_CATEGORIES),
          );
        }
      } catch (e) {
        console.error('Failed to load data', e);
      }
    };
    loadData();
  }, []);

  // ── Persist tasks ────────────────────────────────────────────────────────────
  const persistTasks = useCallback(async (updatedTasks) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedTasks));
    } catch (e) {
      console.error('Failed to save tasks', e);
    }
  }, []);

  // ── Persist categories ───────────────────────────────────────────────────────
  const persistCategories = useCallback(async (updatedCategories) => {
    try {
      await AsyncStorage.setItem(
        CATEGORIES_KEY,
        JSON.stringify(updatedCategories),
      );
    } catch (e) {
      console.error('Failed to save categories', e);
    }
  }, []);

  // ── Add a new category ───────────────────────────────────────────────────────
  const handleAddCategory = () => {
    const trimmed = newCategoryText.trim();
    if (!trimmed) {
      setIsAddingCategory(false);
      return;
    }
    if (categories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      // Silently ignore duplicates (no Alert — import was removed)
      return;
    }
    const updated = [...categories, trimmed];
    setCategories(updated);
    persistCategories(updated);
    setNewCategoryText('');
    setIsAddingCategory(false);
    setActiveCategory(trimmed);
  };

  // ── Add a new task ───────────────────────────────────────────────────────────
  const handleAddTask = () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;

    Keyboard.dismiss();
    setInputText('');

    const newTask = {
      id: Date.now().toString(),
      text: trimmed,
      isCompleted: false,
      category: activeCategory === 'All' ? 'Personal' : activeCategory,
      createdAt: new Date().toISOString(),
    };
    const updated = [newTask, ...tasks];
    setTasks(updated);
    persistTasks(updated);
  };

  // ── Toggle completion (LayoutAnimation smooths the auto-sort reorder) ───────
  const handleToggle = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const updated = tasks.map((t) =>
      t.id === id ? { ...t, isCompleted: !t.isCompleted } : t,
    );
    setTasks(updated);
    persistTasks(updated);
  };

  // ── Delete a task (LayoutAnimation smooths the collapse) ──────────────────
  const handleDelete = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTasks((prev) => {
      const updated = prev.filter((t) => t.id !== id);
      persistTasks(updated);
      return updated;
    });
  };

  // ── Delete a category – open custom modal (long-press) ──────────────────────
  const handleDeleteCategory = (cat) => {
    if (cat === 'All' || cat === 'Personal') return; // 'All' and 'Personal' are protected — never deletable
    setCategoryToDelete(cat);
    setShowDeleteModal(true);
  };

  // ── Confirm category deletion (called from custom modal) ───────────────────
  const confirmDeleteCategory = () => {
    const cat = categoryToDelete;
    setShowDeleteModal(false);
    setCategoryToDelete(null);
    if (!cat) return;

    // Re-assign orphaned tasks to 'Personal'
    setTasks((prev) => {
      const updated = prev.map((t) =>
        t.category === cat ? { ...t, category: 'Personal' } : t,
      );
      persistTasks(updated);
      return updated;
    });
    // Remove the category
    setCategories((prev) => {
      const updated = prev.filter((c) => c !== cat);
      persistCategories(updated);
      return updated;
    });
    // Fall back to 'All' if the active category was just deleted
    if (activeCategory === cat) setActiveCategory('All');
  };

  // ── Derive sorted + filtered list (pending first, completed last) ─────────────
  const displayedTasks = (() => {
    const filtered =
      activeCategory === 'All'
        ? tasks
        : tasks.filter((t) => t.category === activeCategory);
    const pending = filtered.filter((t) => !t.isCompleted);
    const completed = filtered.filter((t) => t.isCompleted);
    return [...pending, ...completed];
  })();

  // ── Render each task item (delegates to ToDoItem) ─────────────────────────
  const renderItem = ({ item }) => (
    <ToDoItem
      item={item}
      onToggle={handleToggle}
      onDelete={handleDelete}
      showCategory={activeCategory === 'All'}
    />
  );

  const pendingCount = tasks.filter((t) => !t.isCompleted).length;
  const completedCount = tasks.filter((t) => t.isCompleted).length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
          >
            <ArrowLeftIcon size={24} color="#111827" />
          </TouchableOpacity>

          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerTitle}>My Tasks</Text>
            {tasks.length > 0 && (
              <Text style={styles.headerSubtitle}>
                {pendingCount} pending · {completedCount} done
              </Text>
            )}
          </View>

          {/* Spacer to visually centre title */}
          <View style={styles.backBtn} />
        </View>

        {/* ── CATEGORY CHIPS ─────────────────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
          keyboardShouldPersistTaps="handled"
        >
          {categories.map((cat) => (
            <Reanimated.View
              key={cat}
              entering={ZoomIn.duration(200)}
            >
              <TouchableOpacity
                style={[
                  styles.categoryChip,
                  activeCategory === cat && styles.categoryChipActive,
                ]}
                onPress={() => setActiveCategory(cat)}
                onLongPress={() => handleDeleteCategory(cat)}
                delayLongPress={400}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    activeCategory === cat && styles.categoryChipTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            </Reanimated.View>
          ))}

          {/* Inline add-category chip */}
          {isAddingCategory ? (
            <View style={styles.categoryInputChip}>
              <TextInput
                style={styles.categoryInput}
                value={newCategoryText}
                onChangeText={setNewCategoryText}
                placeholder="Category name"
                placeholderTextColor="#9ca3af"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleAddCategory}
                onBlur={handleAddCategory}
                maxLength={20}
              />
            </View>
          ) : (
            <TouchableOpacity
              style={styles.categoryAddChip}
              onPress={() => {
                setIsAddingCategory(true);
                setNewCategoryText('');
              }}
              activeOpacity={0.7}
            >
              <PlusIcon size={14} color="#6b7280" />
              <Text style={styles.categoryAddText}>Add</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* ── TASK INPUT CARD ─────────────────────────────────────────────── */}
        <View style={styles.inputCard}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Add a new task..."
            placeholderTextColor="#9ca3af"
            onSubmitEditing={handleAddTask}
            returnKeyType="done"
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[
              styles.addBtn,
              !inputText.trim() && styles.addBtnDisabled,
            ]}
            onPress={handleAddTask}
            disabled={!inputText.trim()}
          >
            <PlusIcon size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* ── TASK LIST ───────────────────────────────────────────────────── */}
        {displayedTasks.length === 0 ? (
          <View style={styles.emptyState}>
            <ArchiveBoxIcon size={52} color="#d1d5db" />
            <Text style={styles.emptyTitle}>All clear!</Text>
            <Text style={styles.emptySubtitle}>
              {activeCategory === 'All'
                ? 'Add your first task above to get started.'
                : `No tasks in "${activeCategory}" yet.`}
            </Text>
          </View>
        ) : (
          <FlatList
            data={displayedTasks}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </KeyboardAvoidingView>

      {/* ── DELETE CATEGORY MODAL ──────────────────────────────────────── */}
      <Modal
        transparent
        visible={showDeleteModal}
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Icon accent */}
            <View style={styles.modalIconWrap}>
              <TrashIcon size={28} color="#ef4444" />
            </View>

            <Text style={styles.modalTitle}>Delete Category?</Text>
            <Text style={styles.modalBody}>
              <Text style={styles.modalCatName}>“{categoryToDelete}”</Text>
              {' will be removed. Tasks in this category will be moved to ‘Personal’.'}
            </Text>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={() => {
                  setShowDeleteModal(false);
                  setCategoryToDelete(null);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalBtnDelete}
                onPress={confirmDeleteCategory}
                activeOpacity={0.8}
              >
                <Text style={styles.modalBtnDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8f9fa' },
  flex: { flex: 1 },

  // ── Header ──
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 12 : 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitleBlock: { alignItems: 'center' },
  headerTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: '500',
    marginTop: 2,
  },

  // ── Category Chips ──
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
  },
  categoryChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  categoryChipTextActive: {
    color: '#fff',
  },
  categoryAddChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
    gap: 4,
  },
  categoryAddText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  categoryInputChip: {
    borderWidth: 1.5,
    borderColor: '#111827',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    minWidth: 120,
  },
  categoryInput: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    padding: 0,
    margin: 0,
  },

  // ── Input Card ──
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 14,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    paddingVertical: 10,
    paddingRight: 10,
  },
  addBtn: {
    backgroundColor: '#111827',
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnDisabled: {
    backgroundColor: '#d1d5db',
  },

  // ── Task List ──
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  // ── Task Card ──
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 3,
  },
  checkBtn: { marginRight: 14 },
  taskTextContainer: { flex: 1 },
  taskText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 22,
  },
  taskTextCompleted: {
    textDecorationLine: 'line-through',
    color: '#9ca3af',
    fontWeight: '400',
  },
  taskCategoryBadge: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Swipe Delete ──
  swipeDeleteAction: {
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: 16,
    marginBottom: 12,
    gap: 4,
  },
  swipeDeleteText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Delete Category Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 16,
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalBody: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  modalCatName: {
    fontWeight: '700',
    color: '#374151',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  modalBtnCancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
  },
  modalBtnDelete: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#ef4444',
    alignItems: 'center',
  },
  modalBtnDeleteText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },

  // ── Empty State ──
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#374151',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#9ca3af',
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 22,
  },
});

export default ToDoScreen;
