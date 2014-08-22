// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "volume_reader_javascript_stream.h"

#include <pthread.h>
#include <climits>
#include <string>

#include "gtest/gtest.h"

namespace {

const char kFileSystemId[] = "id";
const char kRequestId[] = "1";
const int64_t kArchiveSize = LLONG_MAX - 100;  // Used to test values

}  // namespace

// Fake JavaScriptRequestor that responds to
// VolumeReaderJavaScriptStream::Read.
class FakeJavaScriptRequestor : public JavaScriptRequestor {
 public:
  FakeJavaScriptRequestor() : volume_reader_(NULL), array_buffer_(50) {}

  virtual ~FakeJavaScriptRequestor() {}

  void RequestFileChunk(const std::string& request_id,
                        int64_t offset,
                        int32_t bytes_to_read) {
    offset_ = offset;
    bytes_to_read_ = bytes_to_read;
    pthread_create(&thread_,
                   NULL,
                   FakeJavaScriptRequestor::RequestFileChunkCallback,
                   this);
    // No need to call pthread_join(thread_, NULL) because VolumeReader will
    // block itself anyway until the callback ends.
  }

  void SetVolumeReader(VolumeReaderJavaScriptStream* volume_reader) {
    volume_reader_ = volume_reader;
  }

  pp::VarArrayBuffer array_buffer() const { return array_buffer_; }

 private:
  static void* RequestFileChunkCallback(void* requestor) {
    FakeJavaScriptRequestor* fake_requestor =
        static_cast<FakeJavaScriptRequestor*>(requestor);

    int buffer_size = fake_requestor->array_buffer_.ByteLength();
    // These conditions do not apply in real scenarios, but we need a reason to
    // force failure.
    if (fake_requestor->offset_ < 0 ||
        buffer_size > fake_requestor->bytes_to_read_) {
      fake_requestor->volume_reader_->ReadErrorSignal();
      return 0;
    }

    fake_requestor->volume_reader_->SetBufferAndSignal(
        fake_requestor->array_buffer_);
    return 0;
  }

  pthread_t thread_;
  VolumeReaderJavaScriptStream* volume_reader_;

  pp::VarArrayBuffer array_buffer_;  // Content can be junk. Not important if
                                     // buffer has size > 0. See constructor.
  int64_t offset_;
  int32_t bytes_to_read_;
};

// Class used by TEST_F macro to initialize test environment.
class VolumeReaderJavaScriptStreamTest : public testing::Test {
 protected:
  virtual void SetUp() {
    volume_reader = new VolumeReaderJavaScriptStream(
        std::string(kRequestId), kArchiveSize, &fake_javascript_requestor);
    fake_javascript_requestor.SetVolumeReader(volume_reader);
  }

  virtual void TearDown() { delete volume_reader; }

  FakeJavaScriptRequestor fake_javascript_requestor;
  VolumeReaderJavaScriptStream* volume_reader;
};

TEST_F(VolumeReaderJavaScriptStreamTest, Open) {
  EXPECT_EQ(ARCHIVE_OK, volume_reader->Open());
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

TEST_F(VolumeReaderJavaScriptStreamTest, Read) {
  EXPECT_EQ(0, volume_reader->offset());

  pp::VarArrayBuffer array_buffer = fake_javascript_requestor.array_buffer();
  int32_t array_buffer_size = array_buffer.ByteLength();

  // Valid read with bytes_to_read = array_buffer_size.
  const void* buffer;
  size_t bytes_to_read = array_buffer_size;
  int read_bytes = volume_reader->Read(bytes_to_read, &buffer);
  EXPECT_EQ(array_buffer_size, read_bytes);

  const void* expected_buffer = array_buffer.Map();
  EXPECT_TRUE(memcmp(buffer, expected_buffer, read_bytes) == 0);

  // Valid read with bytes_to_read > array_buffer_size.
  bytes_to_read = array_buffer_size * 2;
  read_bytes = volume_reader->Read(bytes_to_read, &buffer);
  EXPECT_EQ(array_buffer_size, read_bytes);  // Though the request was for more
                                             // than array_buffer_size, Read
                                             // returns only array_buffer_size
                                             // as the buffer is set to
                                             // array_buffer.
  EXPECT_TRUE(memcmp(buffer, expected_buffer, read_bytes) == 0);

  // Read at the end of archive.
  volume_reader->Seek(0, SEEK_END);
  EXPECT_EQ(0, volume_reader->Read(bytes_to_read, &buffer));

  // Invalid read. bytes_to_read smaller than array_buffer_size will force
  // failure. See FakeJavaScriptRequestor::RequestFileChunkCallback.
  volume_reader->Seek(0, SEEK_SET);
  bytes_to_read = array_buffer_size / 2;
  EXPECT_EQ(ARCHIVE_FATAL, volume_reader->Read(bytes_to_read, &buffer));
}

TEST_F(VolumeReaderJavaScriptStreamTest, Close) {
  EXPECT_EQ(ARCHIVE_OK, volume_reader->Close());
}
