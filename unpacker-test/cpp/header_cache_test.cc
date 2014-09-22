// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "header_cache.h"

#include <string>

#include "gtest/gtest.h"

// Class used by TEST_F macro to initialize the environment for testing
// HeaderCache methods.
class HeaderCacheTest : public testing::Test {
 protected:
  HeaderCacheTest() : header_cache(NULL) {}

  virtual void SetUp() { header_cache = new HeaderCache(); }

  virtual void TearDown() {
    delete header_cache;
    header_cache = NULL;
  }

  HeaderCache* header_cache;
};

TEST_F(HeaderCacheTest, GetHeaderForEmptyCache) {
  ssize_t cached_buffer_size = 0;
  const void* cached_buffer = header_cache->GetHeader(0, &cached_buffer_size);
  EXPECT_EQ(NULL, cached_buffer);
}

TEST_F(HeaderCacheTest, AddOneSmallHeader) {
  const char expected_header[] = "Some random header data.";
  ASSERT_GE(header_cache_config::kMaximumHeaderBufferSize,
            sizeof(expected_header));

  int64_t offset = 0;
  header_cache->AddHeader(offset, expected_header, sizeof(expected_header));

  ssize_t cached_buffer_size = 0;
  const void* cached_buffer =
      header_cache->GetHeader(offset, &cached_buffer_size);

  EXPECT_EQ(sizeof(expected_header), cached_buffer_size);
  EXPECT_EQ(std::string(expected_header),
            static_cast<const char*>(cached_buffer));
}

TEST_F(HeaderCacheTest, AddTwoSmallHeaders) {
  const char expected_header1[] = "First header data.";
  ASSERT_GE(header_cache_config::kMaximumHeaderBufferSize,
            sizeof(expected_header1));

  const char expected_header2[] = "And the second header data.";
  ASSERT_GE(header_cache_config::kMaximumHeaderBufferSize,
            sizeof(expected_header2));

  int64_t offset1 = 0;
  header_cache->AddHeader(offset1, expected_header1, sizeof(expected_header1));

  int64_t offset2 = 10;
  header_cache->AddHeader(offset2, expected_header2, sizeof(expected_header2));

  ssize_t cached_buffer_size1 = 0;
  const void* cached_buffer1 =
      header_cache->GetHeader(offset1, &cached_buffer_size1);
  EXPECT_EQ(sizeof(expected_header1), cached_buffer_size1);
  EXPECT_EQ(std::string(expected_header1),
            static_cast<const char*>(cached_buffer1));

  ssize_t cached_buffer_size2 = 0;
  const void* cached_buffer2 =
      header_cache->GetHeader(offset2, &cached_buffer_size2);
  EXPECT_EQ(sizeof(expected_header2), cached_buffer_size2);
  EXPECT_EQ(std::string(expected_header2),
            static_cast<const char*>(cached_buffer2));
}

TEST_F(HeaderCacheTest, AddBigHeader) {
  ssize_t big_size = header_cache_config::kMaximumHeaderBufferSize * 2;
  char* expected_header = new char[big_size];
  memset(expected_header, 1, big_size);

  int64_t offset = 0;
  header_cache->AddHeader(offset, expected_header, big_size);

  ssize_t cached_buffer_size = 0;
  const void* cached_buffer =
      header_cache->GetHeader(offset, &cached_buffer_size);

  EXPECT_EQ(header_cache_config::kMaximumHeaderBufferSize, cached_buffer_size);
  EXPECT_EQ(0, memcmp(expected_header, cached_buffer, cached_buffer_size));

  delete expected_header;
}
