// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "volume_archive.h"

#include <climits>

#include "fake_lib_archive.h"
#include "gtest/gtest.h"

namespace {

const char kRequestId[] = "1";

}  // namespace

// A fake VolumeReader for libarchive custom functions for processing archives
// data.
class FakeVolumeReader : public VolumeReader {
 public:
  // The calls to VolumeReader are tested by integration tests as they are used
  // only by libarchive.
  int Open() { return ARCHIVE_OK; }
  ssize_t Read(size_t bytes_to_read, const void** destination_buffer) {
    return 0;  // Not important.
  }
  int64_t Skip(int64_t bytes_to_skip) { return 0; /* Not important. */ }
  int64_t Seek(int64_t offset, int whence) { return 0; /* Not important. */ }
  int Close() { return ARCHIVE_OK; }
};

// Class used by TEST_F macro to initialize test environment.
class VolumeArchiveTest : public testing::Test {
 protected:
  virtual void SetUp() {
    lib_archive_variables::ResetVariables();
    fake_reader = new FakeVolumeReader();
    volume_archive = new VolumeArchive(std::string(kRequestId), fake_reader);
  }

  virtual void TearDown() {
    // fake_reader is deleted by VolumeArchive.
    volume_archive->Cleanup();
    delete volume_archive;
  }

  FakeVolumeReader* fake_reader;
  VolumeArchive* volume_archive;
};

TEST_F(VolumeArchiveTest, Constructor) {
  EXPECT_EQ(volume_archive->request_id(), kRequestId);
  EXPECT_EQ(volume_archive->reader(), fake_reader);
}

TEST_F(VolumeArchiveTest, InitArchiveNewFailure) {
  // Test archive_read_new failure.
  lib_archive_variables::fail_archive_read_new = true;
  EXPECT_FALSE(volume_archive->Init());
  EXPECT_EQ(volume_archive_errors::kArchiveReadNewError,
            volume_archive->error_message());
}

TEST_F(VolumeArchiveTest, InitArchiveSupportFailures) {
  std::string support_error =
      std::string(volume_archive_errors::kArchiveSupportErrorPrefix) +
      lib_archive_variables::kArchiveError;

  // Test rar support failure.
  lib_archive_variables::fail_archive_rar_support = true;
  EXPECT_FALSE(volume_archive->Init());
  EXPECT_EQ(support_error, volume_archive->error_message());

  // Test zip support failure.
  lib_archive_variables::fail_archive_rar_support = false;
  lib_archive_variables::fail_archive_zip_support = true;
  EXPECT_FALSE(volume_archive->Init());
  EXPECT_EQ(support_error, volume_archive->error_message());
}

TEST_F(VolumeArchiveTest, InitOpenFailures) {
  std::string open_error =
      std::string(volume_archive_errors::kArchiveOpenErrorPrefix) +
      lib_archive_variables::kArchiveError;

  // Test set read callback failure.
  lib_archive_variables::fail_archive_set_read_callback = true;
  EXPECT_FALSE(volume_archive->Init());
  EXPECT_EQ(open_error, volume_archive->error_message());

  // Test set skip callback failure.
  lib_archive_variables::fail_archive_set_read_callback = false;
  lib_archive_variables::fail_archive_set_skip_callback = true;
  EXPECT_FALSE(volume_archive->Init());
  EXPECT_EQ(open_error, volume_archive->error_message());

  // Test set seek callback failure.
  lib_archive_variables::fail_archive_set_skip_callback = false;
  lib_archive_variables::fail_archive_set_seek_callback = true;
  EXPECT_FALSE(volume_archive->Init());
  EXPECT_EQ(open_error, volume_archive->error_message());

  // Test set close callback failure.
  lib_archive_variables::fail_archive_set_seek_callback = false;
  lib_archive_variables::fail_archive_set_close_callback = true;
  EXPECT_FALSE(volume_archive->Init());
  EXPECT_EQ(open_error, volume_archive->error_message());

  // Test set callback data failure.
  lib_archive_variables::fail_archive_set_close_callback = false;
  lib_archive_variables::fail_archive_set_callback_data = true;
  EXPECT_FALSE(volume_archive->Init());
  EXPECT_EQ(open_error, volume_archive->error_message());

  // Test archive open failure.
  lib_archive_variables::fail_archive_set_callback_data = false;
  lib_archive_variables::fail_archive_read_open = true;
  EXPECT_FALSE(volume_archive->Init());
  EXPECT_EQ(open_error, volume_archive->error_message());
}

TEST_F(VolumeArchiveTest, InitSuccess) {
  // Test successful init.
  EXPECT_TRUE(volume_archive->Init());
}

TEST_F(VolumeArchiveTest, GetNextHeaderSuccess) {
  std::string expected_path_name =
      std::string(lib_archive_variables::kPathName);
  const char* path_name;
  int64_t size;
  bool is_directory;
  time_t modification_time;

  // Test GetNextHeader for files.
  lib_archive_variables::archive_read_next_header_return_value = ARCHIVE_OK;
  lib_archive_variables::archive_entry_filetype_return_value =
      S_IFREG;  // Regular file.

  EXPECT_TRUE(volume_archive->GetNextHeader(
      &path_name, &size, &is_directory, &modification_time));
  EXPECT_EQ(expected_path_name, path_name);
  EXPECT_EQ(lib_archive_variables::kSize, size);
  EXPECT_EQ(lib_archive_variables::kModificationTime, modification_time);
  EXPECT_FALSE(is_directory);

  // Test GetNextHeader for directories.
  lib_archive_variables::archive_entry_filetype_return_value =
      S_IFDIR;  // Directory.

  EXPECT_TRUE(volume_archive->GetNextHeader(
      &path_name, &size, &is_directory, &modification_time));
  EXPECT_EQ(expected_path_name, path_name);
  EXPECT_EQ(lib_archive_variables::kSize, size);
  EXPECT_EQ(lib_archive_variables::kModificationTime, modification_time);
  EXPECT_TRUE(is_directory);
}

TEST_F(VolumeArchiveTest, GetNextHeaderEndOfArchive) {
  EXPECT_TRUE(volume_archive->Init());

  // Test GetNextHeader when at the end of archive.
  lib_archive_variables::archive_read_next_header_return_value = ARCHIVE_EOF;
  const char* pathname;
  int64_t size;
  bool is_directory;
  time_t modification_time;

  EXPECT_TRUE(volume_archive->GetNextHeader(
      &pathname, &size, &is_directory, &modification_time));
  EXPECT_TRUE(pathname == NULL);
}

TEST_F(VolumeArchiveTest, GetNextHeaderFailure) {
  std::string next_header_error =
      std::string(volume_archive_errors::kArchiveNextHeaderErrorPrefix) +
      lib_archive_variables::kArchiveError;
  EXPECT_TRUE(volume_archive->Init());

  // Test failure GetNextHeader.
  lib_archive_variables::archive_read_next_header_return_value = ARCHIVE_FATAL;
  const char* pathname;
  int64_t size;
  bool is_directory;
  time_t modification_time;

  EXPECT_FALSE(volume_archive->GetNextHeader(
      &pathname, &size, &is_directory, &modification_time));
  EXPECT_EQ(next_header_error, volume_archive->error_message());
}

TEST_F(VolumeArchiveTest, CleanupSuccess) {
  EXPECT_TRUE(volume_archive->reader() != NULL);
  EXPECT_TRUE(volume_archive->Init());

  // Test successful Cleanup after successful Init.
  EXPECT_TRUE(volume_archive->Cleanup());
  EXPECT_TRUE(volume_archive->reader() == NULL);
}

TEST_F(VolumeArchiveTest, CleanupFailure) {
  std::string free_error =
      std::string(volume_archive_errors::kArchiveReadFreeErrorPrefix) +
      lib_archive_variables::kArchiveError;

  EXPECT_TRUE(volume_archive->reader() != NULL);
  EXPECT_TRUE(volume_archive->Init());

  // Test failure Cleanup after successful Init.
  lib_archive_variables::fail_archive_read_free = true;
  EXPECT_TRUE(!volume_archive->Cleanup());
  EXPECT_EQ(free_error, volume_archive->error_message());
  EXPECT_TRUE(volume_archive->reader() == NULL);
}

TEST_F(VolumeArchiveTest, CleanupAfterCleanup) {
  EXPECT_TRUE(volume_archive->reader() != NULL);
  EXPECT_TRUE(volume_archive->Init());

  // Test Cleanup after Cleanup.
  EXPECT_TRUE(volume_archive->Cleanup());
  EXPECT_TRUE(volume_archive->reader() == NULL);

  EXPECT_TRUE(volume_archive->Cleanup());
  EXPECT_TRUE(volume_archive->reader() == NULL);

  // Cleanup is successful because archive_ was set to NULL by previous Cleanup
  // and archive_read_free will not be called in this case.
  lib_archive_variables::fail_archive_read_free = true;
  EXPECT_TRUE(volume_archive->Cleanup());
  EXPECT_TRUE(volume_archive->reader() == NULL);
}

TEST_F(VolumeArchiveTest, CleanupAfterInitFailure) {
  EXPECT_TRUE(volume_archive->reader() != NULL);

  lib_archive_variables::fail_archive_read_open = true;
  EXPECT_TRUE(!volume_archive->Init());

  // Test Cleanup after Init failure.
  EXPECT_TRUE(volume_archive->Cleanup());
  EXPECT_TRUE(volume_archive->reader() == NULL);
}

// TODO(cmihail): Add tests for VolumeArchive::ReadData.
