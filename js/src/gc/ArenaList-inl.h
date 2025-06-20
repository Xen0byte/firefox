/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * vim: set ts=8 sts=2 et sw=2 tw=80:
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef gc_ArenaList_inl_h
#define gc_ArenaList_inl_h

#include "gc/ArenaList.h"

#include "gc/Heap.h"
#include "gc/Zone.h"

bool js::gc::ArenaList::hasNonFullArenas() const {
  // Non-full arenas are kept at the start so we can check the first one.
  return !isEmpty() && !getFirst()->isFull();
}

js::gc::Arena* js::gc::ArenaList::takeInitialNonFullArena() {
  Arena* arena = getFirst();
  if (!arena || arena->isFull()) {
    return nullptr;
  }

  moveFrontToBack();

  return arena;
}

js::gc::SortedArenaList::SortedArenaList(js::gc::AllocKind allocKind)
    : thingsPerArena_(Arena::thingsPerArena(allocKind)) {
#ifdef DEBUG
  MOZ_ASSERT(thingsPerArena_ <= MaxThingsPerArena);
  MOZ_ASSERT(emptyIndex() < BucketCount);
  allocKind_ = allocKind;
#endif
}

size_t js::gc::SortedArenaList::index(size_t nfree, bool* frontOut) const {
  // Get the bucket index to use for arenas with |nfree| free things and set
  // |frontOut| to indicate whether to prepend or append to the bucket.

  MOZ_ASSERT(nfree <= thingsPerArena_);

  // Full arenas go in the first bucket on their own.
  if (nfree == 0) {
    *frontOut = false;
    return 0;
  }

  // Empty arenas go in the last bucket on their own.
  if (nfree == thingsPerArena_) {
    *frontOut = false;
    return emptyIndex();
  }

  // All other arenas are alternately added to the front and back of successive
  // buckets as |nfree| increases.
  *frontOut = (nfree % 2) != 0;
  size_t index = (nfree + 1) / 2;
  MOZ_ASSERT(index != 0);
  MOZ_ASSERT(index != emptyIndex());
  return index;
}

size_t js::gc::SortedArenaList::emptyIndex() const {
  // Get the bucket index to use for empty arenas. This must have its own
  // bucket so they can be removed with extractEmptyTo.
  return bucketsUsed() - 1;
}

size_t js::gc::SortedArenaList::bucketsUsed() const {
  // Get the total number of buckets used for the current alloc kind.
  return HowMany(thingsPerArena_ - 1, 2) + 2;
}

void js::gc::SortedArenaList::insertAt(Arena* arena, size_t nfree) {
  MOZ_ASSERT(!isConvertedToArenaList);
  MOZ_ASSERT(nfree <= thingsPerArena_);

  bool front;
  size_t i = index(nfree, &front);
  MOZ_ASSERT(i < BucketCount);
  if (front) {
    buckets[i].pushFront(arena);
  } else {
    buckets[i].pushBack(arena);
  }
}

bool js::gc::SortedArenaList::hasEmptyArenas() const {
  return !buckets[emptyIndex()].isEmpty();
}

void js::gc::SortedArenaList::extractEmptyTo(Arena** destListHeadPtr) {
  MOZ_ASSERT(!isConvertedToArenaList);
  MOZ_ASSERT(destListHeadPtr);
  check();

  Bucket& bucket = buckets[emptyIndex()];
  if (!bucket.isEmpty()) {
    Arena* tail = *destListHeadPtr;
    Arena* bucketLast = bucket.getLast();
    *destListHeadPtr = bucket.release();
    bucketLast->next = tail;
  }

  MOZ_ASSERT(bucket.isEmpty());
}

js::gc::ArenaList js::gc::SortedArenaList::convertToArenaList(
    Arena* maybeBucketLastOut[BucketCount]) {
#ifdef DEBUG
  MOZ_ASSERT(!isConvertedToArenaList);
  isConvertedToArenaList = true;
  check();
#endif

  if (maybeBucketLastOut) {
    for (size_t i = 0; i < BucketCount; i++) {
      maybeBucketLastOut[i] = buckets[i].getLast();
    }
  }

  // The returned ArenaList needs to contain all non-full arenas in order
  // of increasing free space, followed by all full arenas.
  ArenaList result;
  size_t used = bucketsUsed();
  for (size_t i = 1; i <= used; ++i) {
    size_t bucket = i % used;  // [1, used) then 0.
    result.append(std::move(buckets[bucket]));
  }
  return result;
}

void js::gc::SortedArenaList::restoreFromArenaList(
    ArenaList& list, Arena* bucketLast[BucketCount]) {
#ifdef DEBUG
  MOZ_ASSERT(isConvertedToArenaList);
  isConvertedToArenaList = false;
#endif

  // Group the ArenaList elements into SinglyLinkedList buckets, where the
  // boundaries between buckets are retrieved from |bucketLast|.

  Arena* remaining = list.release();

  size_t used = bucketsUsed();
  for (size_t i = 1; i <= used; ++i) {
    size_t bucket = i % used;  // [1, used) then 0.
    MOZ_ASSERT(buckets[bucket].isEmpty());
    if (bucketLast[bucket]) {
      MOZ_ASSERT(remaining);
      Arena* first = remaining;
      Arena* last = bucketLast[bucket];
      remaining = last->next;
      last->next = nullptr;
      new (&buckets[bucket]) Bucket(first, last);
    }
  }

  MOZ_ASSERT(!remaining);
  check();
}

void js::gc::SortedArenaList::check() const {
#ifdef DEBUG
  const auto& fullBucket = buckets[0];
  for (auto arena = fullBucket.iter(); !arena.done(); arena.next()) {
    MOZ_ASSERT(arena->getAllocKind() == allocKind());
    MOZ_ASSERT(!arena->hasFreeThings());
  }

  for (size_t i = 1; i < emptyIndex(); i++) {
    const auto& bucket = buckets[i];
    size_t lastFree = 0;
    for (auto arena = bucket.iter(); !arena.done(); arena.next()) {
      MOZ_ASSERT(arena->getAllocKind() == allocKind());
      size_t nfree = arena->countFreeCells();
      MOZ_ASSERT(nfree == i * 2 - 1 || nfree == i * 2);
      MOZ_ASSERT(nfree >= lastFree);
      lastFree = nfree;
    }
  }

  const auto& emptyBucket = buckets[emptyIndex()];
  for (auto arena = emptyBucket.iter(); !arena.done(); arena.next()) {
    MOZ_ASSERT(arena->getAllocKind() == allocKind());
    MOZ_ASSERT(arena->isEmpty());
  }

  for (size_t i = emptyIndex() + 1; i < BucketCount; i++) {
    MOZ_ASSERT(buckets[i].isEmpty());
  }
#endif
}

#ifdef DEBUG

bool js::gc::FreeLists::allEmpty() const {
  for (auto i : AllAllocKinds()) {
    if (!isEmpty(i)) {
      return false;
    }
  }
  return true;
}

bool js::gc::FreeLists::isEmpty(AllocKind kind) const {
  return freeLists_[kind]->isEmpty();
}

#endif

void js::gc::FreeLists::clear() {
  for (auto i : AllAllocKinds()) {
#ifdef DEBUG
    auto old = freeLists_[i];
    if (!old->isEmpty()) {
      old->getArena()->checkNoMarkedFreeCells();
    }
#endif
    freeLists_[i] = &emptySentinel;
  }
}

js::gc::TenuredCell* js::gc::FreeLists::allocate(AllocKind kind) {
  return freeLists_[kind]->allocate(Arena::thingSize(kind));
}

void js::gc::FreeLists::unmarkPreMarkedFreeCells(AllocKind kind) {
  FreeSpan* freeSpan = freeLists_[kind];
  if (!freeSpan->isEmpty()) {
    freeSpan->getArena()->unmarkPreMarkedFreeCells();
  }
}

JSRuntime* js::gc::ArenaLists::runtime() {
  return zone_->runtimeFromMainThread();
}

JSRuntime* js::gc::ArenaLists::runtimeFromAnyThread() {
  return zone_->runtimeFromAnyThread();
}

js::gc::Arena* js::gc::ArenaLists::getFirstArena(AllocKind thingKind) const {
  return arenaList(thingKind).getFirst();
}

js::gc::Arena* js::gc::ArenaLists::getFirstCollectingArena(
    AllocKind thingKind) const {
  return collectingArenaList(thingKind).getFirst();
}

bool js::gc::ArenaLists::arenaListsAreEmpty() const {
  for (auto i : AllAllocKinds()) {
    /*
     * The arena cannot be empty if the background finalization is not yet
     * done.
     */
    if (concurrentUse(i) == ConcurrentUse::BackgroundFinalize) {
      return false;
    }
    if (!arenaList(i).isEmpty()) {
      return false;
    }
  }
  return true;
}

bool js::gc::ArenaLists::doneBackgroundFinalize(AllocKind kind) const {
  return concurrentUse(kind) == ConcurrentUse::None;
}

void js::gc::ArenaLists::clearFreeLists() { freeLists().clear(); }

MOZ_ALWAYS_INLINE js::gc::TenuredCell* js::gc::ArenaLists::allocateFromFreeList(
    AllocKind thingKind) {
  return freeLists().allocate(thingKind);
}

void js::gc::ArenaLists::unmarkPreMarkedFreeCells() {
  for (auto i : AllAllocKinds()) {
    freeLists().unmarkPreMarkedFreeCells(i);
  }
}

void js::gc::ArenaLists::checkEmptyFreeLists() {
  MOZ_ASSERT(freeLists().allEmpty());
}

void js::gc::ArenaLists::checkEmptyArenaLists() {
#ifdef DEBUG
  for (auto i : AllAllocKinds()) {
    checkEmptyArenaList(i);
  }
#endif
}

#endif  // gc_ArenaList_inl_h
