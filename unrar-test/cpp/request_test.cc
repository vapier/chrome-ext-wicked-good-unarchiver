// Copyright (c) 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "gtest/gtest.h"
#include "request.h"

const char kFileSystemId[] = "id";
const char kRequestId[] = "0";
const char kError[] = "error";

TEST(request, CreateReadMetadataDoneResponse) {
  pp::VarDictionary metadata;
  metadata.Set("/", "Everything is fine.");

  pp::VarDictionary metadataDone = request::CreateReadMetadataDoneResponse(
      kFileSystemId, kRequestId , metadata);

  EXPECT_TRUE(metadataDone.Get(request::key::kOperation).is_int());
  EXPECT_EQ(request::READ_METADATA_DONE,
            metadataDone.Get(request::key::kOperation).AsInt());

  EXPECT_TRUE(metadataDone.Get(request::key::kFileSystemId).is_string());
  EXPECT_EQ(kFileSystemId,
            metadataDone.Get(request::key::kFileSystemId).AsString());

  EXPECT_TRUE(metadataDone.Get(request::key::kRequestId).is_string());
  EXPECT_EQ(kRequestId,
            metadataDone.Get(request::key::kRequestId).AsString());

  EXPECT_TRUE(metadataDone.Get(request::key::kMetadata).is_dictionary());
  EXPECT_EQ(metadata,
            pp::VarDictionary(metadataDone.Get(request::key::kMetadata)));
}

TEST(request, CreateFileSystemError) {
  pp::VarDictionary error = request::CreateFileSystemError(
      kError, kFileSystemId, kRequestId);

  EXPECT_TRUE(error.Get(request::key::kOperation).is_int());
  EXPECT_EQ(request::FILE_SYSTEM_ERROR,
            error.Get(request::key::kOperation).AsInt());

  EXPECT_TRUE(error.Get(request::key::kFileSystemId).is_string());
  EXPECT_EQ(kFileSystemId,
            error.Get(request::key::kFileSystemId).AsString());

  EXPECT_TRUE(error.Get(request::key::kRequestId).is_string());
  EXPECT_EQ(kRequestId,
            error.Get(request::key::kRequestId).AsString());

  EXPECT_TRUE(error.Get(request::key::kError).is_string());
  EXPECT_EQ(kError, error.Get(request::key::kError).AsString());
}
