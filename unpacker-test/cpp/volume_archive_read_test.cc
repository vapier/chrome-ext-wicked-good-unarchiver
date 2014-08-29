// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "volume_archive.h"

#include "fake_lib_archive.h"
#include "fake_volume_reader.h"
#include "gtest/gtest.h"

namespace {

// The request id for which the tested VolumeArchive is created.
const char kRequestId[] = "1";

}  // namespace

// Class used by TEST_F macro to initialize the environment for testing
// VolumeArchive Read method.
class VolumeArchiveReadTest : public testing::Test {
 protected:
  VolumeArchiveReadTest() : volume_archive(NULL) {}

  virtual void SetUp() {
    lib_archive_variables::ResetVariables();
    // Pass FakeVolumeReader ownership to VolumeArchive.
    volume_archive = new VolumeArchive(std::string(kRequestId),
                                       new FakeVolumeReader());

    // Prepare for read.
    volume_archive->Init();
    const char* path_name = NULL;
    int64_t size = 0;
    bool is_directory = false;
    time_t modification_time = 0;
    volume_archive->GetNextHeader(
        &path_name, &size, &is_directory, &modification_time);
  }

  virtual void TearDown() {
    volume_archive->Cleanup();
    delete volume_archive;
    volume_archive = NULL;
  }

  VolumeArchive* volume_archive;
};

TEST_F(VolumeArchiveReadTest, ReadSuccess) {
  const char* expected_buffer = lib_archive_variables::kArchiveData;
  size_t data_buffer_size = sizeof(lib_archive_variables::kArchiveData);
  ASSERT_GT(lib_archive_variables::kArchiveReadDataErrorThreshold,
            data_buffer_size);

  // Test successful ReadData with length equal to data size.
  size_t full_length = data_buffer_size;
  char full_read_buffer[full_length];
  memset(full_read_buffer, 0, full_length);
  EXPECT_TRUE(volume_archive->ReadData(0, full_length, full_read_buffer));
  EXPECT_TRUE(memcmp(full_read_buffer, expected_buffer, full_length) == 0);

  // Test successful read with offset less than VolumeArchive current offset
  // (due to last read) and length equal to half of the data size.
  size_t half_length = data_buffer_size / 2;
  char first_half_buffer[half_length];
  memset(first_half_buffer, 0, half_length);
  EXPECT_TRUE(volume_archive->ReadData(0, half_length, first_half_buffer));
  EXPECT_TRUE(memcmp(first_half_buffer, expected_buffer, half_length) == 0);

  // Test successful read for the other half of the data.
  int64_t half_offset = half_length;
  int remaining_length = data_buffer_size - half_length;
  char second_half_buffer[remaining_length];
  memset(second_half_buffer, 0, remaining_length);
  EXPECT_TRUE(volume_archive->ReadData(half_offset,
                                       remaining_length,
                                       second_half_buffer));
  EXPECT_TRUE(memcmp(second_half_buffer,
                     expected_buffer + half_offset,
                     remaining_length) == 0);

  // Test successful read with offset less than last read but greater than 0.
  // This should trigger the execution of all the code inside ReadData.
  int64_t offset = data_buffer_size / 3;
  size_t offset_length = data_buffer_size - offset;
  char offset_buffer[offset_length];
  memset(offset_buffer, 0, offset_length);
  EXPECT_TRUE(volume_archive->ReadData(offset, offset_length, offset_buffer));
  EXPECT_TRUE(
      memcmp(offset_buffer, expected_buffer + offset, offset_length) == 0);

  // Test read with length greater than data size.
  size_t big_length = data_buffer_size * 2;
  ASSERT_GT(lib_archive_variables::kArchiveReadDataErrorThreshold,
            big_length);
  char big_buffer[big_length];
  memset(big_buffer, 0, big_length);
  EXPECT_TRUE(volume_archive->ReadData(0, big_length, big_buffer));
  EXPECT_TRUE(memcmp(big_buffer, expected_buffer, data_buffer_size) == 0);

  // Only data_buffer_size should be read and written to big_buffer.
  size_t left_length = big_length - data_buffer_size;
  char zero_buffer[left_length];
  memset(zero_buffer, 0, left_length);
  EXPECT_TRUE(  // The rest of the bytes from big_buffer shouldn't be modified.
      memcmp(big_buffer + data_buffer_size, zero_buffer, left_length) == 0);
}

TEST_F(VolumeArchiveReadTest, ReadFailureForOffsetEqualToZero) {
  size_t threshold = lib_archive_variables::kArchiveReadDataErrorThreshold;
  char buffer[threshold];
  EXPECT_FALSE(volume_archive->ReadData(0, threshold, buffer));

  std::string read_data_error =
      std::string(volume_archive_constants::kArchiveReadDataErrorPrefix) +
      lib_archive_variables::kArchiveError;
  EXPECT_EQ(read_data_error, volume_archive->error_message());
}

TEST_F(VolumeArchiveReadTest, ReadFailureForOffsetGreaterThanZero) {
  int64_t offset = sizeof(lib_archive_variables::kArchiveData) / 2;
  size_t threshold = lib_archive_variables::kArchiveReadDataErrorThreshold;
  char buffer[threshold];
  EXPECT_FALSE(volume_archive->ReadData(offset, threshold, buffer));

  std::string read_data_error =
      std::string(volume_archive_constants::kArchiveReadDataErrorPrefix) +
      lib_archive_variables::kArchiveError;
  EXPECT_EQ(read_data_error, volume_archive->error_message());
}
