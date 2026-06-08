#include <iostream>
#include <openssl/evp.h>

int main() {
    std::cout << "OpenSSL version: " << OPENSSL_VERSION_TEXT << std::endl;
    return 0;
}
