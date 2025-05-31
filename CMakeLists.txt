cmake_minimum_required(VERSION 3.14)

if(DEFINED ENV{VCPKG_ROOT} AND NOT DEFINED CMAKE_TOOLCHAIN_FILE)
    set(CMAKE_TOOLCHAIN_FILE "$ENV{VCPKG_ROOT}/scripts/buildsystems/vcpkg.cmake"
        CACHE STRING "")
endif()

project(accelscript)

# Enable C++17
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Enable testing
enable_testing()

# Find packages
find_package(antlr4-runtime CONFIG REQUIRED)
find_package(antlr4-generator CONFIG REQUIRED)
find_package(GTest CONFIG REQUIRED)

# Download ANTLR JAR if not exists
if(NOT EXISTS ${CMAKE_BINARY_DIR}/antlr-4.13.2-complete.jar)
    file(DOWNLOAD
        https://www.antlr.org/download/antlr-4.13.2-complete.jar
        ${CMAKE_BINARY_DIR}/antlr-4.13.2-complete.jar
        SHOW_PROGRESS
    )
endif()

# Set ANTLR4 JAR location
set(ANTLR4_JAR_LOCATION ${CMAKE_BINARY_DIR}/antlr-4.13.2-complete.jar)

# Configure ANTLR4
set(ANTLR4_OUTPUT_DIR ${CMAKE_CURRENT_BINARY_DIR}/generated)
file(MAKE_DIRECTORY ${ANTLR4_OUTPUT_DIR})

# ANTLR4_GENERATED_SRC_DIRをCMakeの規定値に合わせる
set(ANTLR4_GENERATED_SRC_DIR ${ANTLR4_OUTPUT_DIR})

antlr4_generate(
    accelscript_parser
    ${CMAKE_CURRENT_SOURCE_DIR}/src/AccelScript.g4
    BOTH
    TRUE
    TRUE
    "accelscript"
)

# Create parser library
add_library(parser
    src/parser.cpp
    ${ANTLR4_SRC_FILES_accelscript_parser}
)

target_link_libraries(parser 
    PRIVATE 
        antlr4_shared
)

target_include_directories(parser 
    PUBLIC 
        src
        ${ANTLR4_OUTPUT_DIR}
)

# Create test executable
add_executable(parser_test
    test/parser_test.cpp
)

target_link_libraries(parser_test
    PRIVATE 
        parser
        GTest::gtest
        GTest::gtest_main
        GTest::gmock
        GTest::gmock_main
)

add_test(NAME parser_tests COMMAND parser_test)
