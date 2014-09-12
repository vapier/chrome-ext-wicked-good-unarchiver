// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "volume_archive_libarchive.h"

#include "fake_lib_archive.h"
#include "fake_volume_reader.h"
#include "gtest/gtest.h"

namespace {

// The request id for which the tested VolumeArchiveLibarchive is created.
const char kRequestId[] = "1";

}  // namespace

// Class used by TEST_F macro to initialize the environment for testing
// VolumeArchiveLibarchive methods except for Read.
class VolumeArchiveLibarchiveTest : public testing::Test {
 protected:
  VolumeArchiveLibarchiveTest() : volume_archive(NULL) {}

  virtual void SetUp() {
    lib_archive_variables::ResetVariables();
    // Pass FakeVolumeReader ownership to VolumeArchiveLibarchive.
    volume_archive = new VolumeArchiveLibarchive(std::string(kRequestId),
                                                 new FakeVolumeReader());
  }

  virtual void TearDown() {
    volume_archive->Cleanup();
    delete volume_archive;
    volume_archive = NULL;
  }

  VolumeArchiveLibarchive* volume_archive;
};

TEST_F(VolumeArchiveLibarchiveTest, Constructor) {
  EXPECT_EQ(volume_archive->request_id(), kRequestId);
}

TEST_F(VolumeArchiveLibarchiveTest, InitArchiveNewFailure) {
  // Test archive_read_new failure.
  lib_archive_variables::fail_archive_read_new = true;
  EXPECT_FALSE(volume_archive->Init());
  EXPECT_EQ(volume_archive_constants::kArchiveReadNewError,
            volume_archive->error_message());
}

TEST_F(VolumeArchiveLibarchiveTest, InitArchiveSupportFailures) {
  // Test rar support failure.
  lib_archive_variables::fail_archive_rar_support = true;
  EXPECT_FALSE(volume_archive->Init());

  std::string support_error =
      std::string(volume_archive_constants::kArchiveSupportErrorPrefix) +
      lib_archive_variables::kArchiveError;
  EXPECT_EQ(support_error, volume_archive->error_message());

  // Test zip support failure.
  lib_archive_variables::fail_archive_rar_support = false;
  lib_archive_variables::fail_archive_zip_support = true;
  EXPECT_FALSE(volume_archive->Init());
  EXPECT_EQ(support_error, volume_archive->error_message());
}

TEST_F(VolumeArchiveLibarchiveTest, InitOpenFailures) {
  // Test set read callback failure.
  lib_archive_variables::fail_archive_set_read_callback = true;
  EXPECT_FALSE(volume_archive->Init());

  std::string open_error =
      std::string(volume_archive_constants::kArchiveOpenErrorPrefix) +
      lib_archive_variables::kArchiveError;
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

TEST_F(VolumeArchiveLibarchiveTest, InitSuccess) {
  // Test successful init.
  EXPECT_TRUE(volume_archive->Init());
}

TEST_F(VolumeArchiveLibarchiveTest, GetNextHeaderSuccess) {
  std::string expected_path_name =
      std::string(lib_archive_variables::kPathName);
  const char* path_name = NULL;
  int64_t size = 0;
  bool is_directory = false;
  time_t modification_time = 0;

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

TEST_F(VolumeArchiveLibarchiveTest, GetNextHeaderEndOfArchive) {
  EXPECT_TRUE(volume_archive->Init());

  // Test GetNextHeader when at the end of archive.
  lib_archive_variables::archive_read_next_header_return_value = ARCHIVE_EOF;
  const char* pathname = NULL;
  int64_t size = 0;
  bool is_directory = false;
  time_t modification_time = 0;

  EXPECT_TRUE(volume_archive->GetNextHeader(
      &pathname, &size, &is_directory, &modification_time));
  EXPECT_TRUE(pathname == NULL);
}

TEST_F(VolumeArchiveLibarchiveTest, GetNextHeaderFailure) {
  EXPECT_TRUE(volume_archive->Init());

  // Test failure GetNextHeader.
  lib_archive_variables::archive_read_next_header_return_value = ARCHIVE_FATAL;
  const char* pathname = NULL;
  int64_t size = 0;
  bool is_directory = false;
  time_t modification_time = 0;

  EXPECT_FALSE(volume_archive->GetNextHeader(
      &pathname, &size, &is_directory, &modification_time));

  std::string next_header_error =
      std::string(volume_archive_constants::kArchiveNextHeaderErrorPrefix) +
      lib_archive_variables::kArchiveError;
  EXPECT_EQ(next_header_error, volume_archive->error_message());
}

TEST_F(VolumeArchiveLibarchiveTest, CleanupSuccess) {
  EXPECT_TRUE(volume_archive->reader() != NULL);
  EXPECT_TRUE(volume_archive->Init());

  // Test successful Cleanup after successful Init.
  EXPECT_TRUE(volume_archive->Cleanup());
  EXPECT_EQ(NULL, volume_archive->reader());
}

TEST_F(VolumeArchiveLibarchiveTest, CleanupFailure) {
  EXPECT_TRUE(volume_archive->reader() != NULL);
  EXPECT_TRUE(volume_archive->Init());

  // Test failure Cleanup after successful Init.
  lib_archive_variables::fail_archive_read_free = true;
  EXPECT_TRUE(!volume_archive->Cleanup());

  std::string free_error =
      std::string(volume_archive_constants::kArchiveReadFreeErrorPrefix) +
      lib_archive_variables::kArchiveError;
  EXPECT_EQ(free_error, volume_archive->error_message());
  EXPECT_EQ(NULL, volume_archive->reader());
}

TEST_F(VolumeArchiveLibarchiveTest, CleanupAfterCleanup) {
  EXPECT_TRUE(volume_archive->reader() != NULL);
  EXPECT_TRUE(volume_archive->Init());

  // Test Cleanup after Cleanup.
  EXPECT_TRUE(volume_archive->Cleanup());
  EXPECT_EQ(NULL, volume_archive->reader());

  EXPECT_TRUE(volume_archive->Cleanup());
  EXPECT_EQ(NULL, volume_archive->reader());

  // Cleanup is successful because archive_ was set to NULL by previous Cleanup
  // and archive_read_free will not be called in this case.
  lib_archive_variables::fail_archive_read_free = true;
  EXPECT_TRUE(volume_archive->Cleanup());
  EXPECT_EQ(NULL, volume_archive->reader());
}

TEST_F(VolumeArchiveLibarchiveTest, CleanupAfterInitFailure) {
  EXPECT_TRUE(volume_archive->reader() != NULL);

  lib_archive_variables::fail_archive_read_open = true;
  EXPECT_TRUE(!volume_archive->Init());

  // Test Cleanup after Init failure.
  EXPECT_TRUE(volume_archive->Cleanup());
  EXPECT_EQ(NULL, volume_archive->reader());
}
