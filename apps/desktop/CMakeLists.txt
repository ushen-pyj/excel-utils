cmake_minimum_required(VERSION 3.20)
file(STRINGS "${CMAKE_CURRENT_SOURCE_DIR}/../../VERSION" excel_utils_version LIMIT_COUNT 1)
if(NOT excel_utils_version MATCHES "^(0|[1-9][0-9]{0,4})\\.(0|[1-9][0-9]{0,4})\\.(0|[1-9][0-9]{0,4})$")
    # CMake's regex engine does not support interval quantifiers.
    if(NOT excel_utils_version MATCHES "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$")
        message(FATAL_ERROR "VERSION must contain a stable version such as 0.1.4")
    endif()
endif()
project(ExcelUtils VERSION "${excel_utils_version}" LANGUAGES CXX)
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/../../VERSION")
set(EXCELUTILS_RELEASE_REPOSITORY "ushen-pyj/excel-utils" CACHE STRING "GitHub repository hosting Windows releases")
if(NOT EXCELUTILS_RELEASE_REPOSITORY MATCHES "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
    message(FATAL_ERROR "EXCELUTILS_RELEASE_REPOSITORY must be a GitHub owner/repo slug")
endif()
enable_language(RC)
set(CMAKE_AUTORCC ON)
find_package(Qt5 5.15 REQUIRED COMPONENTS Widgets)
set(sdk "${CMAKE_CURRENT_SOURCE_DIR}/../../third_party/desktop-sdk/ChromiumBasedEditors/lib")
set_source_files_properties(brand/windows.rc PROPERTIES OBJECT_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/brand/excel-utils.ico")
set_source_files_properties(main.cpp workspace.cpp workspace_explorer.cpp workspace_ui.cpp quick_open.cpp workbook_window.cpp header_merge_bridge.cpp research_bridge.cpp PROPERTIES
    OBJECT_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/workbook_window.h;${CMAKE_CURRENT_SOURCE_DIR}/workspace_ui.h")
set_property(SOURCE workspace.cpp workspace_explorer.cpp workbook_window.cpp workspace_search.cpp APPEND PROPERTY
    OBJECT_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/workspace_search.h")
add_executable(ExcelUtils WIN32 main.cpp app_update.cpp workspace.cpp workspace_explorer.cpp workspace_ui.cpp workspace_search.cpp quick_open.cpp workbook_window.cpp header_merge_bridge.cpp research_bridge.cpp window_chrome.qrc brand/brand.qrc brand/windows.rc)
target_compile_features(ExcelUtils PRIVATE cxx_std_17)
target_compile_options(ExcelUtils PRIVATE "$<$<COMPILE_LANGUAGE:CXX>:/utf-8;/permissive>")
target_compile_definitions(ExcelUtils PRIVATE UNICODE _UNICODE NOMINMAX
    EXCELUTILS_VERSION="${PROJECT_VERSION}"
    EXCELUTILS_RELEASE_REPOSITORY="${EXCELUTILS_RELEASE_REPOSITORY}"
    EXCELUTILS_FILE_VERSION=${PROJECT_VERSION_MAJOR},${PROJECT_VERSION_MINOR},${PROJECT_VERSION_PATCH},0)
target_include_directories(ExcelUtils PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/brand" "${sdk}/include" "${sdk}/qt_wrapper/include" "${CMAKE_CURRENT_SOURCE_DIR}/../../third_party/core/Common")
target_link_libraries(ExcelUtils PRIVATE Qt5::Widgets winhttp "${SDK_IMPORT_DIR}/ascdocumentscore.lib" "${SDK_IMPORT_DIR}/qtascdocumentscore.lib")
