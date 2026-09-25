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
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Reanimated, {
  FadeInDown,
  ZoomIn,
} from 'react-native-reanimated';
import {
  STORAGE_PERUSALL_CALENDAR_URL,
  getCourses,
  addCourse,
  deleteCourse,
  fetchPerusallDeadlines,
} from '../utils/perusallFetcher';

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
  AcademicCapIcon,
  XCircleIcon,
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

          {/* Task text + optional category badge or prominent course module tag */}
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
            <View style={styles.tagRow}>
              {item.courseName ? (
                <View style={styles.courseBadge}>
                  <AcademicCapIcon size={12} color="#4338ca" style={{ marginRight: 4 }} />
                  <Text style={styles.courseBadgeText}>{item.courseName}</Text>
                </View>
              ) : showCategory && item.category && item.category !== 'Perusall' ? (
                <Text style={styles.taskCategoryBadge}>{item.category}</Text>
              ) : null}
            </View>
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
const STORAGE_COMPLETED_PERUSALL = '@todo_completed_perusall';
const STORAGE_DISMISSED_PERUSALL = '@todo_dismissed_perusall';
const DEFAULT_CATEGORIES = ['All', 'Personal', 'Perusall'];

const ToDoScreen = ({ navigation }) => {
  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [activeCategory, setActiveCategory] = useState('All');
  const [inputText, setInputText] = useState('');
  const [newCategoryText, setNewCategoryText] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState(null);

  // Perusall & Course state
  const [savedCourses, setSavedCourses] = useState([]);
  const [perusallCalendarUrl, setPerusallCalendarUrl] = useState(null);
  const [perusallDeadlines, setPerusallDeadlines] = useState([]);
  const [isPerusallLoading, setIsPerusallLoading] = useState(false);
  const [completedPerusallIds, setCompletedPerusallIds] = useState([]);
  const [dismissedPerusallIds, setDismissedPerusallIds] = useState([]);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [newModuleCode, setNewModuleCode] = useState('');
  const [newCalendarUrl, setNewCalendarUrl] = useState('');
  const [courseError, setCourseError] = useState('');

  // ── Load persisted data on mount ────────────────────────────────────────────
  useEffect(() => {
    const loadData = async () => {
      try {
        const [
          savedTasks,
          savedCategories,
          savedPerusallUrl,
          savedCompletedP,
          savedDismissedP,
        ] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(CATEGORIES_KEY),
          AsyncStorage.getItem(STORAGE_PERUSALL_CALENDAR_URL),
          AsyncStorage.getItem(STORAGE_COMPLETED_PERUSALL),
          AsyncStorage.getItem(STORAGE_DISMISSED_PERUSALL),
        ]);

        if (savedTasks) {
          const parsed = JSON.parse(savedTasks);
          if (Array.isArray(parsed)) setTasks(parsed);
        }

        if (savedCompletedP) {
          const parsed = JSON.parse(savedCompletedP);
          if (Array.isArray(parsed)) setCompletedPerusallIds(parsed);
        }

        if (savedDismissedP) {
          const parsed = JSON.parse(savedDismissedP);
          if (Array.isArray(parsed)) setDismissedPerusallIds(parsed);
        }

        let parsedCategories = DEFAULT_CATEGORIES;
        if (savedCategories) {
          const parsed = JSON.parse(savedCategories);
          if (Array.isArray(parsed) && parsed.length > 0) {
            parsedCategories = parsed;
          }
        }
        if (!parsedCategories.includes('Perusall')) {
          parsedCategories = [...parsedCategories, 'Perusall'];
        }
        setCategories(parsedCategories);

        // Load stored courses
        const storedCourses = await getCourses();
        setSavedCourses(storedCourses);
        const coursesToFetch = storedCourses.length > 0 ? storedCourses : (savedPerusallUrl ? savedPerusallUrl : null);

        if (coursesToFetch) {
          setPerusallCalendarUrl(typeof coursesToFetch === 'string' ? coursesToFetch : 'multiple');
          setIsPerusallLoading(true);
          try {
            const fetched = await fetchPerusallDeadlines(coursesToFetch);
            setPerusallDeadlines(fetched || []);
          } catch (pErr) {
            console.error('Failed to fetch Perusall deadlines:', pErr);
          } finally {
            setIsPerusallLoading(false);
          }
        } else {
          setPerusallCalendarUrl(null);
          setPerusallDeadlines([]);
        }
      } catch (e) {
        console.error('Failed to load data in ToDoScreen', e);
        setIsPerusallLoading(false);
      }
    };
    loadData();
  }, []);

  const handleAddCourse = async () => {
    const code = newModuleCode.trim();
    const url = newCalendarUrl.trim();

    if (!code || !url) {
      setCourseError('Please enter both module code and calendar feed URL.');
      return;
    }

    try {
      setCourseError('');
      await addCourse({ name: code, calendarUrl: url });
      setNewModuleCode('');
      setNewCalendarUrl('');
      const updated = await getCourses();
      setSavedCourses(updated);
      setPerusallCalendarUrl('multiple');
      setIsPerusallLoading(true);
      const fetched = await fetchPerusallDeadlines(updated);
      setPerusallDeadlines(fetched || []);
      setIsPerusallLoading(false);
    } catch (err) {
      console.error('Error adding course:', err);
      setCourseError('Failed to save course module.');
    }
  };

  const handleDeleteCourse = async (id) => {
    try {
      const updated = await deleteCourse(id);
      setSavedCourses(updated);
      if (updated.length > 0) {
        setIsPerusallLoading(true);
        const fetched = await fetchPerusallDeadlines(updated);
        setPerusallDeadlines(fetched || []);
        setIsPerusallLoading(false);
      } else {
        setPerusallCalendarUrl(null);
        setPerusallDeadlines([]);
      }
    } catch (err) {
      console.error('Error deleting course:', err);
    }
  };

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
  const handleToggle = async (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (String(id).startsWith('perusall-') || perusallDeadlines.some((p) => p.id === id)) {
      const isCurrentlyDone = completedPerusallIds.includes(id);
      const updated = isCurrentlyDone
        ? completedPerusallIds.filter((item) => item !== id)
        : [...completedPerusallIds, id];
      setCompletedPerusallIds(updated);
      await AsyncStorage.setItem(STORAGE_COMPLETED_PERUSALL, JSON.stringify(updated));
      return;
    }

    const updated = tasks.map((t) =>
      t.id === id ? { ...t, isCompleted: !t.isCompleted } : t,
    );
    setTasks(updated);
    persistTasks(updated);
  };

  // ── Delete a task (LayoutAnimation smooths the collapse) ──────────────────
  const handleDelete = async (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (String(id).startsWith('perusall-') || perusallDeadlines.some((p) => p.id === id)) {
      const updated = [...dismissedPerusallIds, id];
      setDismissedPerusallIds(updated);
      await AsyncStorage.setItem(STORAGE_DISMISSED_PERUSALL, JSON.stringify(updated));
      return;
    }

    setTasks((prev) => {
      const updated = prev.filter((t) => t.id !== id);
      persistTasks(updated);
      return updated;
    });
  };

  // ── Delete a category – open custom modal (long-press) ──────────────────────
  const handleDeleteCategory = (cat) => {
    if (cat === 'All' || cat === 'Personal' || cat === 'Perusall') return;
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
  const perusallTaskItems = perusallDeadlines
    .filter((p) => !dismissedPerusallIds.includes(p.id))
    .map((item, idx) => {
      const dateStr = item.deadline instanceof Date
        ? item.deadline.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : (item.deadline ? new Date(item.deadline).toLocaleDateString() : '');

      const courseName = item.courseName || item.subject || null;

      return {
        id: item.id || `perusall-${idx}`,
        text: item.title + (dateStr ? ` (Due: ${dateStr})` : ''),
        description: item.description,
        isCompleted: completedPerusallIds.includes(item.id || `perusall-${idx}`),
        category: courseName || 'Perusall',
        courseName: courseName,
        source: 'perusall',
        deadline: item.deadline,
      };
    });

  const displayedTasks = (() => {
    if (activeCategory === 'Perusall') {
      const pending = perusallTaskItems.filter((t) => !t.isCompleted);
      const completed = perusallTaskItems.filter((t) => t.isCompleted);
      return [...pending, ...completed];
    }

    const allCombined = activeCategory === 'All'
      ? [...tasks, ...perusallTaskItems]
      : tasks.filter((t) => t.category === activeCategory);

    const pending = allCombined.filter((t) => !t.isCompleted);
    const completed = allCombined.filter((t) => t.isCompleted);
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
        {isPerusallLoading && activeCategory === 'Perusall' ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color="#111827" style={{ marginBottom: 12 }} />
            <Text style={styles.emptyTitle}>Loading Course Deadlines...</Text>
            <Text style={styles.emptySubtitle}>Fetching deadlines from your calendar feeds.</Text>
          </View>
        ) : savedCourses.length === 0 && !perusallCalendarUrl && activeCategory === 'Perusall' ? (
          <View style={styles.emptyState}>
            <ArchiveBoxIcon size={52} color="#d1d5db" />
            <Text style={styles.emptyTitle}>No Course Modules</Text>
            <Text style={styles.emptySubtitle}>
              Connect your course calendar feeds (e.g. Perusall or iCal) to sync and track all your module deadlines here.
            </Text>
            <TouchableOpacity
              style={styles.addCoursePromptBtn}
              onPress={() => setShowCourseModal(true)}
              activeOpacity={0.8}
            >
              <PlusIcon size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.addCoursePromptBtnText}>Add your first course module</Text>
            </TouchableOpacity>
          </View>
        ) : displayedTasks.length === 0 ? (
          <View style={styles.emptyState}>
            <ArchiveBoxIcon size={52} color="#d1d5db" />
            <Text style={styles.emptyTitle}>
              {activeCategory === 'Perusall' && !perusallCalendarUrl && savedCourses.length === 0
                ? 'No Course Modules'
                : 'All clear!'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {activeCategory === 'Perusall'
                ? 'No upcoming course module deadlines found in your calendar feeds.'
                : activeCategory === 'All'
                ? 'Add your first task above to get started.'
                : `No tasks in "${activeCategory}" yet.`}
            </Text>
            {savedCourses.length === 0 && (
              <TouchableOpacity
                style={styles.addCoursePromptBtn}
                onPress={() => setShowCourseModal(true)}
                activeOpacity={0.8}
              >
                <PlusIcon size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.addCoursePromptBtnText}>Add your first course module</Text>
              </TouchableOpacity>
            )}
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

      {/* ── COURSE MANAGEMENT MODAL ── */}
      <Modal visible={showCourseModal} animationType="slide" transparent={true}>
        <View style={styles.courseModalOverlay}>
          <View style={[styles.courseModalContent, { height: '85%' }]}>
            {/* Header */}
            <View style={styles.courseModalHeader}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.courseModalTitle}>Manage Course Modules</Text>
                <Text style={styles.courseModalSubtitle}>
                  Add and manage your Perusall & iCalendar course feeds
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowCourseModal(false)} style={{ padding: 5 }}>
                <XCircleIcon size={26} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 25 }}>
              {/* Form Card */}
              <View style={styles.courseFormCard}>
                <Text style={styles.courseInputLabel}>Module Code (e.g., CO423):</Text>
                <TextInput
                  style={styles.courseInput}
                  value={newModuleCode}
                  onChangeText={(text) => {
                    setNewModuleCode(text);
                    if (courseError) setCourseError('');
                  }}
                  placeholder="e.g., CO423"
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="characters"
                />

                <Text style={styles.courseInputLabel}>Calendar Feed URL:</Text>
                <TextInput
                  style={styles.courseInput}
                  value={newCalendarUrl}
                  onChangeText={(text) => {
                    setNewCalendarUrl(text);
                    if (courseError) setCourseError('');
                  }}
                  placeholder="webcal://app.perusall.com/api/v1/calendar/..."
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={{ fontSize: 11, color: '#6b7280', marginTop: -10, marginBottom: 12 }}>
                  webcal:// URLs are automatically converted to https://
                </Text>

                {courseError ? (
                  <Text style={styles.courseErrorText}>{courseError}</Text>
                ) : null}

                <TouchableOpacity
                  style={styles.addCourseBtn}
                  onPress={handleAddCourse}
                  activeOpacity={0.8}
                >
                  <PlusIcon size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.addCourseBtnText}>Add Module</Text>
                </TouchableOpacity>
              </View>

              {/* Saved Courses List */}
              <Text style={[styles.courseSectionTitle, { marginTop: 15, marginBottom: 12 }]}>
                Saved Modules ({savedCourses.length})
              </Text>

              {savedCourses.length === 0 ? (
                <View style={styles.emptyCourseBox}>
                  <ArchiveBoxIcon size={36} color="#9ca3af" style={{ marginBottom: 8 }} />
                  <Text style={styles.emptyCourseText}>No course modules added yet.</Text>
                  <Text style={styles.emptyCourseSubtext}>Add a module above to start syncing its deadlines.</Text>
                </View>
              ) : (
                savedCourses.map((course) => (
                  <View key={course.id} style={styles.courseItemCard}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <View style={styles.courseBadge}>
                        <Text style={styles.courseBadgeText}>{course.name || 'Unnamed Module'}</Text>
                      </View>
                      <Text style={styles.courseUrlText} numberOfLines={1} ellipsizeMode="middle">
                        {course.calendarUrl}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteCourseBtn}
                      onPress={() => handleDeleteCourse(course.id)}
                      activeOpacity={0.7}
                    >
                      <TrashIcon size={20} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

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

  // ── Course Module Tags & Modal Styles ──
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    flexWrap: 'wrap',
  },
  courseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0e7ff',
    borderColor: '#c7d2fe',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  courseBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3730a3',
  },
  addCoursePromptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  addCoursePromptBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  courseModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  courseModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    elevation: 10,
  },
  courseModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  courseModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  courseModalSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  courseSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  courseFormCard: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },
  courseInputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4b5563',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  courseInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    marginBottom: 14,
  },
  courseErrorText: {
    color: '#ef4444',
    fontSize: 13,
    marginBottom: 10,
    fontWeight: '600',
  },
  addCourseBtn: {
    backgroundColor: '#111827',
    paddingVertical: 13,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCourseBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  courseItemCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  courseUrlText: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 2,
  },
  deleteCourseBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
  },
  emptyCourseBox: {
    padding: 24,
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
  },
  emptyCourseText: {
    color: '#374151',
    fontWeight: '700',
    fontSize: 14,
  },
  emptyCourseSubtext: {
    color: '#9ca3af',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
});

export default ToDoScreen;
