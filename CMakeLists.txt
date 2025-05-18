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
find_package(GTest CONFIG REQUIRED)

# Generate ANTLR parser
add_custom_command(
    OUTPUT
        ${CMAKE_CURRENT_BINARY_DIR}/AccelScriptLexer.cpp
        ${CMAKE_CURRENT_BINARY_DIR}/AccelScriptParser.cpp
        ${CMAKE_CURRENT_BINARY_DIR}/AccelScriptVisitor.cpp
    COMMAND
        ${ANTLR_EXECUTABLE} -Dlanguage=Cpp -listener -visitor
        -o ${CMAKE_CURRENT_BINARY_DIR}
        ${CMAKE_CURRENT_SOURCE_DIR}/src/AccelScript.g4
    DEPENDS
        ${CMAKE_CURRENT_SOURCE_DIR}/src/AccelScript.g4
)

# Create parser library
add_library(parser
    src/parser.cpp
    ${CMAKE_CURRENT_BINARY_DIR}/AccelScriptLexer.cpp
    ${CMAKE_CURRENT_BINARY_DIR}/AccelScriptParser.cpp
    ${CMAKE_CURRENT_BINARY_DIR}/AccelScriptVisitor.cpp
)
target_link_libraries(parser 
    PRIVATE antlr4_shared
)
target_include_directories(parser PUBLIC src)

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
