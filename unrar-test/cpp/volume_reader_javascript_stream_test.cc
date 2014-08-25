// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "volume_reader_javascript_stream.h"

#include <climits>
#include <string>

#include "gmock/gmock.h"
#include "gtest/gtest.h"

const char kFileSystemId[] = "id";
const char kRequestId[] = "1";
const int64_t kArchiveSize = LLONG_MAX - 100;  // Used to test values
                                               // beyond int32_t.

class MockInstance : public pp::Instance {
 public:
  MockInstance() : pp::Instance(1 /* PP_Instance is int32_t. */) {}

  // Cannot mock PostMessage as it is not virtual.
  MOCK_METHOD1(HandleMessage, void(const pp::Var& message));
};

// Class used by TEST_F macro to initialize test environment.
class VolumeReaderJavaScriptStreamTest : public testing::Test {
 protected:
  virtual void SetUp() {
    volume_reader = new VolumeReaderJavaScriptStream(
        std::string(kFileSystemId), std::string(kRequestId),
        kArchiveSize, &mock_instance);
  }

  virtual void TearDown() {
    delete volume_reader;
  }

  MockInstance mock_instance;
  VolumeReaderJavaScriptStream* volume_reader;
};

TEST_F(VolumeReaderJavaScriptStreamTest, Open) {
  EXPECT_EQ(ARCHIVE_OK, volume_reader->Open());
}

TEST_F(VolumeReaderJavaScriptStreamTest, Read) {
  // TODO(cmihail): Test this method in CL
  // https://chromium-review.googlesource.com/#/c/213710/
  // The reason is that pp::Instance::PostMessage is not virtual and so we can't
  // mock it. That CL will eliminate the dependency on
  // pp::Instance::PostMessage.
}

TEST_F(VolumeReaderJavaScriptStreamTest, Skip) {
  EXPECT_EQ(0, volume_reader->offset());

  // Skip with value smaller than int32_t.
  EXPECT_EQ(1, volume_reader->Skip(1));
  EXPECT_EQ(1, volume_reader->offset());

  // Skip with value greater than int32_t.
  int64_t bigBytesToSkipNum = INT_MAX;
  bigBytesToSkipNum += 50;
  EXPECT_EQ(bigBytesToSkipNum, volume_reader->Skip(bigBytesToSkipNum));
  EXPECT_EQ(bigBytesToSkipNum + 1 /* +1 from first call. */,
            volume_reader->offset());
}

TEST_F(VolumeReaderJavaScriptStreamTest, Seek) {
  EXPECT_EQ(0, volume_reader->offset());

  // Seek from start.
  EXPECT_EQ(10, volume_reader->Seek(10, SEEK_SET));
  EXPECT_EQ(10, volume_reader->offset());

  // Seek from current with positive value.
  EXPECT_EQ(15, volume_reader->Seek(5, SEEK_CUR));
  EXPECT_EQ(15, volume_reader->offset());

  // Seek from current with negative value.
  EXPECT_EQ(5, volume_reader->Seek(-10, SEEK_CUR));
  EXPECT_EQ(5, volume_reader->offset());

  // Seek from current with value greater than int32_t.
  int64_t positiveSkipValue = INT_MAX;
  positiveSkipValue += 50;
  EXPECT_EQ(positiveSkipValue + 5 /* +5 from last Seek call. */,
            volume_reader->Seek(positiveSkipValue, SEEK_CUR));
  EXPECT_EQ(positiveSkipValue + 5, volume_reader->offset());

  // Seek from current with value smaller than int32_t.
  int64_t negativeSkipValue = -positiveSkipValue;
  EXPECT_EQ(5, volume_reader->Seek(negativeSkipValue, SEEK_CUR));
  EXPECT_EQ(5, volume_reader->offset());

  // Seek from start with value greater than int32_t.
  EXPECT_EQ(positiveSkipValue,
            volume_reader->Seek(positiveSkipValue, SEEK_SET));
  EXPECT_EQ(positiveSkipValue, volume_reader->offset());

  // Seek from end. SEEK_END requires negative values.
  EXPECT_EQ(kArchiveSize - 5, volume_reader->Seek(-5, SEEK_END));
  EXPECT_EQ(kArchiveSize - 5, volume_reader->offset());

  // Seek from end with value smaller than int32_t.
  int64_t expectedOffset = kArchiveSize + negativeSkipValue;
  EXPECT_EQ(expectedOffset, volume_reader->Seek(negativeSkipValue, SEEK_END));
  EXPECT_EQ(expectedOffset, volume_reader->offset());

  // Seek from current with 0.
  EXPECT_EQ(expectedOffset, volume_reader->Seek(0, SEEK_CUR));
  EXPECT_EQ(expectedOffset, volume_reader->offset());

  // Seek from start with 0.
  EXPECT_EQ(0, volume_reader->Seek(0, SEEK_SET));
  EXPECT_EQ(0, volume_reader->offset());

  // Seek from end with 0.
  EXPECT_EQ(kArchiveSize, volume_reader->Seek(0, SEEK_END));
  EXPECT_EQ(kArchiveSize, volume_reader->offset());

  // Seeking with invalid values resulting in offsets smaller than 0 or offsets
  // greater than kArchiveSize represents a programmer error and it's not up to
  // Seek to test it.
}

TEST_F(VolumeReaderJavaScriptStreamTest, Close) {
  EXPECT_EQ(ARCHIVE_OK, volume_reader->Close());
}
