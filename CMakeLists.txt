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
find_package(ANTLR4 CONFIG REQUIRED)
find_package(GTest CONFIG REQUIRED)

# Set up ANTLR
include_directories(${ANTLR4_INCLUDE_DIRS})

# Generate ANTLR parser
find_program(ANTLR_EXECUTABLE antlr4)
if(NOT ANTLR_EXECUTABLE)
    set(ANTLR_EXECUTABLE "$ENV{VCPKG_ROOT}/installed/x64-windows/tools/antlr4/antlr4.exe")
endif()

# Create parser library
add_library(parser
    src/parser.cpp
)
target_link_libraries(parser 
    PRIVATE antlr4_static
)
target_include_directories(parser PUBLIC src)

# Create test executable
add_executable(parser_test
    test/parser_test.cpp
)
target_link_libraries(parser_test
    PRIVATE 
        parser
        GTest::gtest_main
)

include(GoogleTest)
gtest_discover_tests(parser_test)
