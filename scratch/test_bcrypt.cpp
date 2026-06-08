#include <windows.h>
#include <bcrypt.h>
#include <iostream>

int main() {
    BCRYPT_ALG_HANDLE hAlg = NULL;
    NTSTATUS status = BCryptOpenAlgorithmProvider(&hAlg, BCRYPT_SHA256_ALGORITHM, NULL, 0);
    if (status == 0) { // STATUS_SUCCESS
        std::cout << "Successfully opened SHA256 provider!" << std::endl;
        BCryptCloseAlgorithmProvider(hAlg, 0);
    } else {
        std::cout << "Failed to open provider, status: " << status << std::endl;
    }
    return 0;
}
